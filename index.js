import axios from 'axios';
import FormData from 'form-data';
import qs from 'query-string';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import estados from './estados.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cidadeAtendida = async (dados) => {
    const info = qs.stringify({
        validado: "S",
        ...dados
    });

    try {
        const response = await axios.post("https://portal.gissonline.com.br/primeiro_acesso/seleciona_cidade.cfm", info, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Content-Length": info.length
            },
            responseType: 'json'
        });
        const paginaResultado = response.data.toString();
        const $ = cheerio.load(paginaResultado);
        const script = $("script").get();
        const conteudoscript = script[0].children[0].data.toString();
        const lines = conteudoscript.split("\n");
        const pidArray = [];
        lines.map(line => {
            const parsedLine = String(line.toString().trim());
            if (parsedLine.startsWith("listClientes.push")) {
                const pid = parsedLine.match(/\d+/g).join("");
                pidArray.push(+pid);
            }
        });

        let atende = false;
        const tagslink = $("body form table").find("a");
        for (const tag of tagslink) {
            const cidade = $(tag).text().trim();
            const pid = $(tag).attr("onclick").trim().match(/\d+/g).join("");
            const cidadeNormalized = dados.busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (cidade.toLowerCase() === cidadeNormalized.toLowerCase()) {
                atende = pidArray.includes(+pid);
                break;
            };
        }
        return atende;
    }
    catch (e) {
        console.error(e.message);
        console.error(e.response.data.toString());
    }
}

const municipios = [];

const montaArquivo = async () => {
    let contador = 0;
    const result = [];
    
    for (contador = 0; contador < municipios.length; contador++) {
        const linha = municipios[contador];

        try {
            const sigla = estados.find(estado => estado.label === linha.Estado).value;
            const dados = {
                busca: linha.Municipio.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
                estado: sigla
            };

            console.log(`${contador}/${municipios.length} => Obtendo dados para ${dados.busca}/${sigla}`);
            const atende = await cidadeAtendida(dados);
            console.log(`Resultado para ${JSON.stringify(dados)} => ${atende}\n`);
            result.push(`${linha.CodIBGE}|${+atende}`);

        }
        catch (error) {
            console.log(error);
            console.log({linha});
            await sleep(1000);
            contador--;
        }
    }
    return result;
}

const main = async () => {
    const content = await fs.readFile("./municipios.json");
    const parsedContent = JSON.parse(content.toString());
    console.log(`total de ${parsedContent.dados.length} municipios para serem consultados`);
    municipios.push(...Object.values(parsedContent.dados));
    const resultado = await montaArquivo();
    await fs.writeFile("./Resultado_ConsultaGinfes.txt", resultado.join("\n"));
}

main();