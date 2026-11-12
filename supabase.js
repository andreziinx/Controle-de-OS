/* ==========================================
   SUPABASE - sincronização entre aparelhos
   Carregue este arquivo ANTES do script.js

   Regras:
   - O app nunca fica bloqueado esperando o servidor: sem internet, ele usa
     os dados deste aparelho e tenta de novo depois.
   - Nada é enviado antes de uma leitura bem-sucedida (sbOnline), senão o
     banco poderia receber dados velhos por cima dos de outro aparelho.
   - Se um envio falhar no meio, o que já subiu fica marcado como enviado.
========================================== */
var SB_URL = "https://llmwmqmkqhwjvilkpseq.supabase.co";
var SB_KEY = "sb_publishable_7wXP-xiLJJ2H12qD6YN0WQ_keb0PneE";
var SB_BUCKET = "fotos";
var SB_VERSAO = 6;   // sobe quando este arquivo mudar (aparece em Dados e backup)

var sb = null;
var sbOnline = false;
var sbOcupado = false;
var sbEstOk = true;        // false se a tabela 'estoque' ainda não existir no Supabase
var sbComOk = true;        // false se a tabela 'compras' ainda não existir no Supabase
var sbAvisouEst = false;
var sbAvisouCom = false;
var sbAvisouBucket = false;
var sbAvisouRede = false;
var sbFalhasSeguidas = 0;  // falhas de rede em sequência (espera crescente entre tentativas)
var sbUltimoEnvio = 0;
var sbFalhasEnvio = 0;     // falhas de envio em sequência (zera só quando um envio dá certo)
var sbSnap = { ordens: {}, usuarios: {}, eventos: {}, avisos: {}, estoque: {}, compras: {}, config: {} };

/* ==========================================
   TEMPO REAL (Supabase Realtime)
   O servidor avisa o celular assim que outra pessoa grava uma OS, em vez de
   esperar o ciclo de 30 segundos. Se o Realtime não estiver ligado no projeto,
   o app continua funcionando com a busca periódica (nada quebra).
========================================== */
var sbRtCanal = null;
var sbRtOk = null;        // true = Realtime ligado | false = não ligou | null = ainda testando
var sbRtEspera = 0;       // tempo de espera antes de tentar reconectar
var sbRtRecarregar = false;   // chegou aviso com a tela ocupada: busca assim que liberar
var sbAoAtualizar = null;     // função do script.js chamada depois de uma busca por aviso

function sbLigarRealtime() {
    if (!sb || !sb.channel || sbRtCanal) return;
    try {
        sbRtCanal = sb.channel("tempo-real")
            .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, sbRecebeuAviso)
            .on("postgres_changes", { event: "*", schema: "public", table: "avisos" }, sbRecebeuAviso)
            .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, sbRecebeuAviso)
            .subscribe(function (st) {
                if (st === "SUBSCRIBED") {
                    sbRtOk = true;
                    sbRtEspera = 0;
                } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
                    sbRtOk = false;
                    sbRtCanal = null;
                    // tenta de novo mais tarde (sem incomodar o usuário)
                    sbRtEspera = Math.min((sbRtEspera || 15000) * 2, 120000);
                    setTimeout(sbLigarRealtime, sbRtEspera);
                }
            });
    } catch (e) {
        sbRtOk = false;
        sbRtCanal = null;
    }
}

// Chegou mudança do servidor. Se a tela estiver ocupada (formulário, ficha
// aberta), guarda o aviso e busca quando o usuário fechar.
function sbRecebeuAviso() {
    if (typeof user !== "function" || !user()) return;
    if (sbTelaOcupada()) {
        sbRtRecarregar = true;
        return;
    }
    sbRtRecarregar = false;
    clearTimeout(sbRecebeuAviso.h);
    sbRecebeuAviso.h = setTimeout(function () {
        if (!sbOcupado) sbAtualizar();
        if (typeof sbAoAtualizar === "function") {
            try { sbAoAtualizar(); } catch (e) {}
        }
    }, 400);   // agrupa vários avisos seguidos numa busca só
}

// Chamado pelo script.js: a tela ficou livre (fechou ficha/formulário).
// Se ficou alguma novidade esperando, busca agora.
function sbLiberouTela() {
    if (!sbRtRecarregar) return;
    sbRtRecarregar = false;
    if (!sbOcupado) sbAtualizar();
}

function sbTelaOcupada() {
    if (typeof viewAtual !== "undefined" && viewAtual === "nova") return true;
    try {
        if (document.getElementById("sheet") && document.getElementById("sheet").classList.contains("on")) return true;
        if (document.getElementById("relTela") && document.getElementById("relTela").classList.contains("on")) return true;
    } catch (e) {}
    return false;
}

try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
        sb = window.supabase.createClient(SB_URL, SB_KEY);
    }
} catch (e) {
    console.warn("Supabase indisponível:", e && e.message);
    sb = null;
}

/* ==========================================
   PLANO B DA BIBLIOTECA
   A biblioteca do Supabase vem de um site externo (jsDelivr). No celular ela
   às vezes não chega (internet fraca, bloqueio, cache velho do service worker)
   e o app ficava sem conexão nenhuma, mostrando "Biblioteca do Supabase não
   carregou". Agora, se ela não estiver pronta quando o app precisar, tentamos
   baixar de outro endereço e começamos a sincronizar sem recarregar a página.
========================================== */
var SB_CDN_ALT = [
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
];
var sbCarregandoLib = null;

function sbCarregarBiblioteca() {
    if (sb) return Promise.resolve(true);
    if (sbCarregandoLib) return sbCarregandoLib;

    sbCarregandoLib = new Promise(function (resolve) {
        var i = 0;
        function tentar() {
            if (sb) return resolve(true);
            if (i >= SB_CDN_ALT.length) { sbCarregandoLib = null; return resolve(false); }
            var end = SB_CDN_ALT[i++];
            var s = document.createElement("script");
            s.src = end;
            s.async = true;
            s.onload = function () {
                try {
                    if (window.supabase && typeof window.supabase.createClient === "function") {
                        sb = window.supabase.createClient(SB_URL, SB_KEY);
                    }
                } catch (e) { sb = null; }
                if (sb) {
                    console.warn("Biblioteca do Supabase carregada pelo plano B:", end);
                    try {
                        // Redesenha a tela de diagnóstico, se estiver aberta
                        if (typeof abrirDadosConexao === "function" &&
                            document.getElementById("sheet") &&
                            document.getElementById("sheet").classList.contains("on") &&
                            /Conexão com o banco/.test(document.getElementById("sheet").innerHTML)) {
                            abrirDadosConexao();
                        }
                    } catch (e) {}
                    try { sbAtualizar(); sbLigarRealtime(); } catch (e) {}
                    resolve(true);
                } else {
                    tentar();
                }
            };
            s.onerror = function () {
                // remove o script que falhou para não deixar lixo na página
                try { s.remove(); } catch (e) {}
                tentar();
            };
            document.head.appendChild(s);
        }
        tentar();
    });
    return sbCarregandoLib;
}

// Garante a biblioteca antes de qualquer uso (chamado na abertura do app)
function sbGarantirBiblioteca(cb) {
    if (sb) { cb(true); return; }
    sbCarregarBiblioteca().then(function (ok) { cb(ok); });
}

/* Traduz o erro do Supabase para algo que dá para resolver */
function sbMotivoErro(e) {
    var m = String((e && (e.message || e.details || e.hint)) || e || "");
    var cod = String((e && e.code) || "");
    if (cod === "PGRST205" || cod === "42P01" || /could not find the table|does not exist|schema cache/i.test(m))
        return "Conectou ao Supabase, mas as tabelas não existem: rode o supabase.sql no SQL Editor.";
    if (cod === "PGRST301" || /invalid api key|apikey|jwt|unauthorized|401/i.test(m))
        return "Chave do Supabase recusada: confira SB_KEY no supabase.js.";
    if (cod === "42501" || /row-level security|permission denied/i.test(m))
        return "Sem permissão no banco: rode o supabase.sql (cria as políticas de acesso).";
    if (cod === "NoSuchBucket" || /bucket not found/i.test(m))
        return "O espaço de fotos não existe no Supabase: rode o supabase.sql para criar o bucket 'fotos'.";
    if (/exceeded the maximum allowed size|Payload too large|entity too large|too large/i.test(m))
        return "O arquivo é maior que o limite do espaço de fotos do Supabase (aumente o limite do bucket 'fotos' ou use um vídeo mais curto).";
    if (/failed to fetch|networkerror|load failed|network request failed|timeout|fetch/i.test(m))
        return "Não alcançou o Supabase: confira a internet (os dados ficam salvos neste aparelho).";
    return "Erro do servidor: " + m.slice(0, 80) + ".";
}

function sbEhErroDeRede(e) {
    var cod = String((e && e.code) || "");
    var m = String((e && e.message) || e || "");
    return cod === "PGRST000" || cod === "PGRST001" || cod === "" && /failed to fetch|network|load failed|timeout/i.test(m) ||
           /failed to fetch|networkerror|load failed|network request failed|timeout/i.test(m);
}

function sbListas() {
    return { ordens: ordens, usuarios: usuarios, eventos: eventos, avisos: avisos, estoque: estoque, compras: compras };
}

function sbConfigAtual() {
    return { setores: setores, empresa: empresa };
}

function sbMapa(arr) {
    var m = {};
    (arr || []).forEach(function (x) {
        if (!x || x.id == null) return;      // registro sem id não pode quebrar o mapa
        m[String(x.id)] = JSON.stringify(x);
    });
    return m;
}

// Lista segura: o que vem do banco pode não ser array
function sbLista(v) {
    return Array.isArray(v) ? v : [];
}

/* ==========================================
   FOTOS -> Supabase Storage
   (no banco fica só o link da foto)
========================================== */
function sbEhDataUrl(s) {
    // fotos e vídeos anexados na OS (antes só foto: vídeo ficava preso no aparelho)
    return typeof s === "string" && (s.indexOf("data:image") === 0 || s.indexOf("data:video") === 0);
}

function sbExtArquivo(tipo) {
    var m = /^data:([^;]+);/.exec(tipo || "");
    var t = (m ? m[1] : "").toLowerCase();
    var mapa = {
        "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic",
        "image/heif": "heif", "image/avif": "avif", "image/tiff": "tif", "image/bmp": "bmp",
        "image/svg+xml": "svg",
        "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogv", "video/quicktime": "mov",
        "video/x-matroska": "mkv", "video/3gpp": "3gp", "video/x-msvideo": "avi"
    };
    if (mapa[t]) return mapa[t];
    if (t.indexOf("image/") === 0) return "jpg";
    if (t.indexOf("video/") === 0) return "mp4";
    return "bin";
}

// Base64 -> Blob sem depender de fetch (o fetch com data URL pode falhar no celular)
function sbDataUrlParaBlob(dataUrl) {
    var p = String(dataUrl).split(",");
    var tipo = (/:(.*?);/.exec(p[0]) || [])[1] || "application/octet-stream";
    var bin = atob(p[1] || "");
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: tipo });
}

async function sbUpload(dataUrl, pasta) {
    var blob = sbDataUrlParaBlob(dataUrl);
    var ext = blob.type === "image/png" ? "png" : sbExtArquivo(dataUrl);
    var nome = pasta + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    // timeout: um envio que nunca responde travava a fila toda (inclusive as OS)
    var envio = sb.storage.from(SB_BUCKET).upload(nome, blob, { contentType: blob.type, cacheControl: "31536000" });
    var r = await Promise.race([envio, new Promise(function (res) {
        setTimeout(function () { res({ error: new Error("tempo esgotado no envio da imagem") }); }, 45000);
    })]);
    if (r.error) throw r.error;
    return sb.storage.from(SB_BUCKET).getPublicUrl(nome).data.publicUrl;
}

/* Sobe as imagens que ainda estão em base64 e troca pelo link.
   Uma foto que falhar não impede as outras: continua valendo no próximo envio.
   IMPORTANTE: esta rotina nunca pode derrubar o envio das OS (antes, um erro
   aqui — foto pesada, celular sem memória — fazia a OS nova não subir). */
async function sbSubirImagens() {
    var mudou = false;

    async function trocaLista(arr, pasta) {
        if (!Array.isArray(arr)) return;
        for (var i = 0; i < arr.length; i++) {
            if (!sbEhDataUrl(arr[i])) continue;
            var velho = arr[i];
            var url;
            try {
                url = await sbUpload(velho, pasta);
            } catch (e) {
                var msg = String(e && e.message);
                if (/bucket/i.test(msg)) {
                    if (!sbAvisouBucket) {
                        sbAvisouBucket = true;
                        toast("Não foi possível enviar fotos: " + sbMotivoErro(e));
                    }
                    return;                     // sem bucket, nem tenta as próximas
                }
                if (/maximum allowed size|entity too large|payload too large/i.test(msg)) {
                    toast(sbMotivoErro(e));     // arquivo grande demais (vídeo): avisa e segue
                }
                continue;                       // foto com problema: tenta de novo depois
            }
            var j = arr.indexOf(velho);         // pode ter sido removida durante o envio
            if (j !== -1) { arr[j] = url; mudou = true; }
        }
    }

    try {
        var os = ordens.slice();
        for (var a = 0; a < os.length; a++) {
            if (!os[a] || !os[a].fotos) continue;
            await trocaLista(os[a].fotos.antes, "os/" + os[a].id);
            await trocaLista(os[a].fotos.depois, "os/" + os[a].id);
            if (sbAvisouBucket) break;
        }
    } catch (e) {
        console.warn("Supabase (fotos das OS):", e);
    }

    try {
        var us = usuarios.slice();
        for (var b = 0; b < us.length && !sbAvisouBucket; b++) {
            if (sbEhDataUrl(us[b].foto)) {
                var v = us[b].foto;
                var u = await sbUpload(v, "perfil").catch(function () { return null; });
                if (u && us[b].foto === v) { us[b].foto = u; mudou = true; }
                if (!u) break;
            }
        }

        var es = estoque.slice();
        for (var c = 0; c < es.length && !sbAvisouBucket; c++) {
            if (sbEhDataUrl(es[c].foto)) {
                var ve = es[c].foto;
                var ue = await sbUpload(ve, "estoque").catch(function () { return null; });
                if (ue && es[c].foto === ve) { es[c].foto = ue; mudou = true; }
                if (!ue) break;
            }
        }

        if (!sbAvisouBucket && sbEhDataUrl(empresa.logo)) {
            var vl = empresa.logo;
            var ul = await sbUpload(vl, "logo").catch(function () { return null; });
            if (ul && empresa.logo === vl) { empresa.logo = ul; mudou = true; }
        }
    } catch (e) {
        console.warn("Supabase (imagens):", e);
    }

    if (mudou) {   // guarda os links também neste aparelho
        kvSet("ordens", ordens);
        kvSet("usuarios", usuarios);
        kvSet("empresa", empresa);
        kvSet("estoque", estoque);
        if (typeof renderTudo === "function") {
            try { if (typeof aplicarMarca === "function") aplicarMarca(); renderTudo(); } catch (e) {}
        }
    }
    return mudou;
}

/* ==========================================
   CARREGAR
========================================== */
function sbLocal() {
    return Promise.all([
        kvGet("ordens"), kvGet("usuarios"), kvGet("setores"), kvGet("eventos"),
        kvGet("avisos"), kvGet("empresa"), kvGet("estoque"), kvGet("compras")
    ]);
}

// Trava com temporizador: numa OS grande, ou com o servidor (Supabase) fora do ar,
// o envio pode demorar mais que o prazo do socorro abaixo. Aí este contador
// mantém a resposta pendente em vez de fingir que deu certo.
var sbTravaLida = 0;

// Lê uma tabela inteira (pagina de 1000 em 1000: o Supabase corta em 1000 linhas)
async function sbLerTabela(nome, select) {
    var tudo = [], passo = 1000, de = 0;
    for (;;) {
        sbTravaLida++;
        try {
            var r = await sb.from(nome).select(select).range(de, de + passo - 1);
            if (r.error) throw r.error;
            var lote = Array.isArray(r.data) ? r.data : [];
            tudo = tudo.concat(lote);
            if (lote.length < passo) break;
            de += passo;
            if (de > 50000) break;             // trava de segurança
        } finally {
            sbTravaLida--;
        }
    }
    return tudo;
}

async function sbCarregar() {
    if (!sb) return sbLocal();
    var lento;
    // Rede de segurança: se o servidor não responder (internet ruim, projeto
    // pausado), o app abre com os dados do aparelho em vez de ficar na tela de
    // carregamento para sempre. A leitura original continua rodando.
    var lenta = new Promise(function (res) {
        lento = setTimeout(function () { res(null); }, 9000);
    });
    var venceu = await Promise.race([sbCarregarDeVerdade(), lenta]);
    clearTimeout(lento);

    if (venceu === null) {
        // ainda sem resposta: se o carregamento terminar sem erro logo depois,
        // aproveita o que veio do servidor
        sbLento = true;
        return sbLocal();
    }
    return venceu;
}

var sbLento = false;
var sbLeituraId = 0;   // identifica a leitura em andamento (para saber se ainda vale)
var sbMotivoUltimo = "";   // último motivo de falha de leitura (aparece no diagnóstico)

async function sbCarregarDeVerdade() {
    var meuId = ++sbLeituraId;
    try {
        var out = {};
        var nomes = ["ordens", "usuarios", "eventos", "avisos"];
        for (var i = 0; i < nomes.length; i++) {
            var linhas = await sbLerTabela(nomes[i], "data");
            out[nomes[i]] = linhas.map(function (x) { return x.data; }).filter(Boolean);
        }

        // Tabelas que podem ainda não existir no projeto: o app continua funcionando sem elas
        try {
            var le = await sbLerTabela("estoque", "data");
            out.estoque = le.map(function (x) { return x.data; }).filter(Boolean);
            sbEstOk = true;
        } catch (e2) {
            sbEstOk = false;
            out.estoque = sbLista(await kvGet("estoque"));
            if (!sbAvisouEst) { sbAvisouEst = true; toast("Estoque: " + sbMotivoErro(e2)); }
        }

        try {
            var lc = await sbLerTabela("compras", "data");
            out.compras = lc.map(function (x) { return x.data; }).filter(Boolean);
            sbComOk = true;
        } catch (e3) {
            sbComOk = false;
            out.compras = sbLista(await kvGet("compras"));
            if (!sbAvisouCom) { sbAvisouCom = true; toast("Compras: " + sbMotivoErro(e3)); }
        }

        var cfg = {};
        try {
            var lcfg = await sbLerTabela("config", "k,v");
            lcfg.forEach(function (x) { cfg[x.k] = x.v; });
        } catch (e4) {
            var local = await sbLocal();
            cfg.setores = sbLista(local[2]);
            cfg.empresa = local[5] || { nome: "", logo: "" };
        }

        sbOnline = true;
        sbFalhasSeguidas = 0;
        sbAvisouRede = false;
        sbMotivoUltimo = "";

        // Guarda o que veio do servidor: o envio compara com este retrato.
        // Antes isto só era feito no fim de sbCarregar(), e quando o banco estava
        // vazio (ou a leitura caía no plano B) o retrato ficava vazio: o app
        // reenviava tudo e NUNCA apagava no servidor a OS excluída aqui.
        sbSnap.ordens = sbMapa(out.ordens);
        sbSnap.usuarios = sbMapa(out.usuarios);
        sbSnap.eventos = sbMapa(out.eventos);
        sbSnap.avisos = sbMapa(out.avisos);
        sbSnap.estoque = sbMapa(out.estoque);
        sbSnap.compras = sbMapa(out.compras);
        sbSnap.config = {
            setores: cfg.setores ? JSON.stringify(cfg.setores) : null,
            empresa: cfg.empresa ? JSON.stringify(cfg.empresa) : null
        };

        // Banco vazio: aproveita o que já existe neste aparelho (ou cria os dados iniciais)
        if (!out.usuarios.length) return sbLocal();

        // O app já abriu com os dados do aparelho (o servidor demorou): junta
        // agora o que veio do servidor, sem perder o que foi feito nesse meio-tempo.
        // Só a leitura mais recente pode mexer na tela.
        if (sbLento && meuId === sbLeituraId) {
            sbLento = false;
            if (typeof sbAtualizar === "function") sbAtualizar();
        }

        return [
            out.ordens,
            out.usuarios,
            Array.isArray(cfg.setores) ? cfg.setores : null,
            out.eventos,
            out.avisos,
            (cfg.empresa && typeof cfg.empresa === "object") ? cfg.empresa : { nome: "", logo: "" },
            out.estoque,
            out.compras
        ];
    } catch (e) {
        sbOnline = false;
        sbMotivoUltimo = sbMotivoErro(e);
        console.warn("Supabase:", e);
        // Avisa só na primeira falha: sem isso, um celular sem internet
        // mostrava o mesmo aviso a cada 30 segundos.
        if (!sbAvisouRede) { sbAvisouRede = true; toast(sbMotivoErro(e) + " Usando os dados deste aparelho."); }
        return sbLocal();
    }
}

/* ==========================================
   ENVIAR (só o que mudou)
========================================== */
var sbTabelasOk = { ordens: 1, usuarios: 1, eventos: 1, avisos: 1, estoque: 1, compras: 1 };

function sbSync() {
    if (!sb) return;
    clearTimeout(sbSync.h);
    sbSync.h = setTimeout(function () { sbSync.h = null; sbEnviar(); }, 500);
}

/* Envia as tabelas. Cada tabela é independente: se "estoque" falhar, a OS
   criada agora sobe do mesmo jeito (antes, um erro em qualquer tabela
   interrompia a sequência e as OS seguintes nunca chegavam ao servidor). */
function sbChamar(fn, ms) {
    return Promise.race([fn(), new Promise(function (res, rej) {
        setTimeout(function () { rej(new Error("tempo esgotado no envio")); }, ms || 30000);
    })]);
}

async function sbEnviarTabelas() {
    var listas = sbListas();
    var primeiroErro = null;

    for (var t in listas) {
        if (!sbTabelasOk[t]) continue;
        if (t === "estoque" && !sbEstOk) continue;
        if (t === "compras" && !sbComOk) continue;

        try {
            var lista = sbLista(listas[t]);
            var atual = sbMapa(lista);
            var ant = sbSnap[t] || {};
            var subir = lista.filter(function (x) { return x && x.id != null && ant[String(x.id)] !== atual[String(x.id)]; });
            var apagar = Object.keys(ant).filter(function (id) { return atual[id] === undefined; });

            for (var i = 0; i < subir.length; i += 5) {   // lote pequeno: OS com foto em base64 é pesada
                var lote = subir.slice(i, i + 5).map(function (x) {
                    return { id: String(x.id), data: x, updated_at: new Date().toISOString() };
                });
                var r = await sbChamar(function () { return sb.from(t).upsert(lote); });
                if (r.error) throw r.error;
                // marca o que já subiu: se falhar depois, não reenvia tudo de novo
                lote.forEach(function (x) { sbSnap[t][x.id] = JSON.stringify(x.data); });
            }
            if (apagar.length) {
                var d = await sbChamar(function () { return sb.from(t).delete().in("id", apagar); });
                if (d.error) throw d.error;
            }
            sbSnap[t] = atual;
        } catch (e) {
            console.warn("Supabase (" + t + "):", e);
            if (!primeiroErro) primeiroErro = e;
        }
    }

    // erro de rede na primeira tabela: o resto também falhou (avisa uma vez só)
    if (primeiroErro) throw primeiroErro;
}

async function sbEnviar() {
    if (!sb) return;
    if (!sbOnline) {
        // Ainda sem leitura bem-sucedida: não envia (evita subir dado velho), mas
        // também NÃO esquece o pedido. Antes ele era descartado aqui e a OS nova
        // nunca chegava ao servidor; agora tenta ler de novo em seguida.
        clearTimeout(sbEnviar.re);
        sbEnviar.re = setTimeout(function () { sbAtualizar(); }, 4000);
        return;
    }
    // Leitura em andamento (o app demorou e ainda está buscando): espera terminar,
    // senão o retrato (sbSnap) seria comparado com dados incompletos.
    if (sbTravaLida > 0) { sbSync(); return; }
    if (sbOcupado) { sbSync(); return; }
    sbOcupado = true;
    try {
        // 1) O QUE IMPORTA PRIMEIRO: o texto das OS (título, status, itens, relatório).
        //    As fotos/base64 podem ser grandes ou o bucket pode estar fora do ar; antes
        //    isso acontecia ANTES do envio e, se travasse, a OS nova nunca subia.
        await sbEnviarTabelas();

        // 2) Depois as imagens (perfil, estoque, logo, fotos das OS) e um segundo envio
        try { await sbSubirImagens(); } catch (eImg) { console.warn("Supabase (imagens):", eImg); }
        await sbEnviarTabelas();

        var cfg = sbConfigAtual();
        for (var k in cfg) {
            var js = JSON.stringify(cfg[k]);
            if (sbSnap.config[k] !== js) {
                var rc = await sb.from("config").upsert({ k: k, v: cfg[k], updated_at: new Date().toISOString() });
                if (rc.error) throw rc.error;
                sbSnap.config[k] = js;
            }
        }
        sbUltimoEnvio = Date.now();
        sbFalhasSeguidas = 0;
        sbFalhasEnvio = 0;
        sbMotivoUltimo = "";
        sbLigarRealtime();           // envio deu certo: garante o canal de tempo real aberto
    } catch (e) {
        console.warn("Supabase:", e);
        sbMotivoUltimo = sbMotivoErro(e);
        var rede = sbEhErroDeRede(e);
        sbFalhasSeguidas++;
        sbFalhasEnvio++;
        // Falha repetida no envio (mesmo parecendo "rede"): avisa uma vez, para não ficar mudo
        if (rede && sbFalhasEnvio === 3) {
            toast("Não está conseguindo enviar as alterações. Se a internet está boa, rode o supabase.sql (fotos grandes sem o bucket 'fotos' podem travar o envio).");
        }
        if (rede) {
            // Sem internet: silencioso (o usuário já vê "offline" na tela de dados).
            // Tenta de novo com espera crescente, até 2 minutos.
            sbOnline = false;
            setTimeout(function () { sbAtualizar(); }, 15000);
        } else {
            toast("Não foi possível sincronizar. " + sbMotivoErro(e));
            setTimeout(sbSync, 15000);
        }
    }
    sbOcupado = false;
}

/* ==========================================
   MESCLAR: servidor + o que ainda não foi enviado
   `antes` = retrato do servidor ANTES desta leitura.
   - criada/editada aqui e ainda não enviada -> vale a versão daqui
   - apagada aqui e ainda não enviada        -> continua apagada
   - o resto                                 -> vale o servidor
========================================== */
function sbMesclar(srvLista, locLista, antes) {
    var srv = sbLista(srvLista), loc = sbLista(locLista);
    antes = antes || {};
    var locMap = {}, srvMap = {}, out = [], pendente = false;
    loc.forEach(function (x) { if (x && x.id != null) locMap[String(x.id)] = x; });
    srv.forEach(function (x) { if (x && x.id != null) srvMap[String(x.id)] = x; });

    // Banco vazio mas com OS neste aparelho: nada foi enviado ainda (servidor novo ou
    // envio que falhou). Antes a comparação achava que já estava tudo igual e a OS
    // ficava só no celular. Aqui, tudo o que existe aqui conta como pendente.
    if (!srv.length && loc.length) {
        antes = {};
        pendente = true;
    }

    srv.forEach(function (s) {
        if (!s || s.id == null) return;
        var id = String(s.id), l = locMap[id], a = antes[id];
        if (a !== undefined && l === undefined) { pendente = true; return; }   // apagada aqui
        if (l !== undefined && a !== undefined && JSON.stringify(l) !== a) {   // editada aqui
            out.push(l); pendente = true; return;
        }
        out.push(s);
    });
    loc.forEach(function (l) {
        if (!l || l.id == null) return;
        var id = String(l.id);
        if (srvMap[id]) return;
        var a = antes[id];
        if (a === undefined || JSON.stringify(l) !== a) {                      // criada aqui
            out.push(l); pendente = true;
        }
    });
    return { lista: out, pendente: pendente };
}

/* Quantas OS deste aparelho ainda não chegaram ao servidor (para a tela
   "Atualizações e conexão"). Compara com o último retrato do servidor. */
function sbPendentes() {
    if (typeof ordens === "undefined" || !Array.isArray(ordens)) return 0;
    var n = 0;
    ordens.forEach(function (o) {
        if (!o || o.id == null) return;
        var antes = (sbSnap.ordens && sbSnap.ordens[String(o.id)]) || "";
        if (!antes || JSON.stringify(o) !== antes) n++;
    });
    return n;
}
function sbCopiaSnap() {
    var c = { config: Object.assign({}, sbSnap.config || {}) };
    ["ordens", "usuarios", "eventos", "avisos", "estoque", "compras"].forEach(function (t) {
        c[t] = Object.assign({}, sbSnap[t] || {});
    });
    return c;
}

/* ==========================================
   BUSCAR MUDANÇAS DE OUTROS APARELHOS
========================================== */
async function sbAtualizar() {
    if (!sb || sbOcupado) return;
    if (typeof user !== "function" || !user()) return;      // sem login, não sincroniza
    if (viewAtual === "nova") return;
    if ($("sheet") && $("sheet").classList.contains("on")) return;
    if ($("relTela") && $("relTela").classList.contains("on")) return;

    if (sbSync.h) { clearTimeout(sbSync.h); sbSync.h = null; await sbEnviar(); }
    if (sbOcupado) return;

    var r;
    var antes = sbCopiaSnap();     // retrato anterior: serve para achar o que ainda não subiu
    var setoresAntes = antes.config.setores, empresaAntes = antes.config.empresa;
    try {
        r = await sbCarregar();
    } catch (e) {
        return;   // sem rede agora: tenta de novo no próximo ciclo
    }
    if (!r || !Array.isArray(r) || !r[1] || !sbOnline) return;

    // (o filtro acima já evita atualizar com a folha ou o formulário abertos)
    // Antes: ordens = servidor. Isso APAGAVA daqui a OS criada e ainda não enviada
    // (ex.: criada logo depois de uma falha de rede). Agora mescla.
    var pend = false;
    function mescla(srv, loc, ant) {
        var m = sbMesclar(srv, loc, ant);
        if (m.pendente) pend = true;
        return m.lista;
    }
    var novaUsuarios = sbLista(r[1]);
    if (!novaUsuarios.length) return;                        // servidor vazio: não apaga a equipe
    ordens = mescla(r[0], ordens, antes.ordens);
    usuarios = mescla(novaUsuarios, usuarios, antes.usuarios);
    eventos = mescla(r[3], eventos, antes.eventos);
    avisos = mescla(r[4], avisos, antes.avisos);
    estoque = mescla(r[6], estoque, antes.estoque);
    compras = mescla(r[7], compras, antes.compras);
    if (setoresAntes != null && JSON.stringify(setores) !== setoresAntes) pend = true;   // setores editados aqui: mantém
    else setores = Array.isArray(r[2]) && r[2].length ? r[2] : setores;
    if (empresaAntes != null && JSON.stringify(empresa) !== empresaAntes) pend = true;
    else empresa = (r[5] && typeof r[5] === "object") ? r[5] : empresa;
    if (pend) sbSync();                                      // sobe o que estava pendente

    try {
        normalizar();
        if (!userPorId(sessao)) { sair(); return; }
        aplicarMarca();
        renderTudo();
    } catch (e) {
        console.warn("Falha ao atualizar a tela:", e);
    }
    // Sobe logo o que ficou pendente (o sbSync acima espera 0,5 s; aqui não perde a vez)
    if (pend && !sbOcupado) sbEnviar();
}

// Leitura completa + envio do que ficou pendente (usada pelo diagnóstico
// "Testar agora" em Perfil > Dados e backup > Conexão com o banco)
async function sbForcarEnvio() {
    if (!sb) return false;
    try { await sbCarregarDeVerdade(); } catch (e) { return false; }
    if (!sbOnline) return false;
    await sbEnviar();
    return sbFalhasEnvio === 0;
}

// Ao voltar o app para a frente do celular: busca na hora (o tempo real pode
// ter ficado suspenso enquanto o app estava minimizado)
document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
        sbAtualizar();
        if (!sbRtCanal && sbRtOk !== false) sbLigarRealtime();
    }
});

// Ao voltar a internet, sincroniza na hora
window.addEventListener("online", function () {
    sbFalhasSeguidas = 0;
    sbRtEspera = 0;
    sbAtualizar();
    sbLigarRealtime();
});

// Tempo real como prioridade; a busca periódica de 60 s fica só como socorro
// (antes eram 30 s e cada rodada lia o banco inteiro, gastando internet do celular)
setInterval(function () {
    if (document.hidden) return;          // app minimizado: não gasta internet
    sbAtualizar();
}, 60000);
