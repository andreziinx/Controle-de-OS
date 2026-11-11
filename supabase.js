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
var SB_VERSAO = 2;   // sobe quando este arquivo mudar (aparece em Dados e backup)

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
var sbSnap = { ordens: {}, usuarios: {}, eventos: {}, avisos: {}, estoque: {}, compras: {}, config: {} };

try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
        sb = window.supabase.createClient(SB_URL, SB_KEY);
    }
} catch (e) {
    console.warn("Supabase indisponível:", e && e.message);
    sb = null;
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
    return typeof s === "string" && s.indexOf("data:image") === 0;
}

async function sbUpload(dataUrl, pasta) {
    var resp = await fetch(dataUrl);
    var blob = await resp.blob();
    var ext = blob.type === "image/png" ? "png" : "jpg";
    var nome = pasta + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var r = await sb.storage.from(SB_BUCKET).upload(nome, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (r.error) throw r.error;
    return sb.storage.from(SB_BUCKET).getPublicUrl(nome).data.publicUrl;
}

/* Sobe as imagens que ainda estão em base64 e troca pelo link.
   Uma foto que falhar não impede as outras: continua valendo no próximo envio. */
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
                if (/bucket/i.test(String(e && e.message))) {
                    if (!sbAvisouBucket) {
                        sbAvisouBucket = true;
                        toast("Não foi possível enviar fotos: " + sbMotivoErro(e));
                    }
                    return;                     // sem bucket, nem tenta as próximas
                }
                continue;                       // foto com problema: tenta de novo depois
            }
            var j = arr.indexOf(velho);         // pode ter sido removida durante o envio
            if (j !== -1) { arr[j] = url; mudou = true; }
        }
    }

    var os = ordens.slice();
    for (var a = 0; a < os.length; a++) {
        if (!os[a] || !os[a].fotos) continue;
        await trocaLista(os[a].fotos.antes, "os/" + os[a].id);
        await trocaLista(os[a].fotos.depois, "os/" + os[a].id);
        if (sbAvisouBucket) break;
    }

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

async function sbCarregarDeVerdade() {
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
        if (sbLento) {
            sbLento = false;
            if (typeof user === "function" && user()) {
                try {
                    normalizar();
                    aplicarMarca();
                    renderTudo();
                } catch (e6) { console.warn("Supabase:", e6); }
            }
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

async function sbEnviar() {
    if (!sb || !sbOnline) return;          // nunca envia sem ter lido o servidor antes
    // Leitura em andamento (o app demorou e ainda está buscando): espera terminar,
    // senão o retrato (sbSnap) seria comparado com dados incompletos.
    if (sbTravaLida > 0) { sbSync(); return; }
    if (sbOcupado) { sbSync(); return; }
    sbOcupado = true;
    try {
        await sbSubirImagens();

        var listas = sbListas();
        for (var t in listas) {
            if (!sbTabelasOk[t]) continue;
            if (t === "estoque" && !sbEstOk) continue;
            if (t === "compras" && !sbComOk) continue;

            var lista = sbLista(listas[t]);
            var atual = sbMapa(lista);
            var ant = sbSnap[t] || {};
            var subir = lista.filter(function (x) { return x && x.id != null && ant[String(x.id)] !== atual[String(x.id)]; });
            var apagar = Object.keys(ant).filter(function (id) { return atual[id] === undefined; });

            for (var i = 0; i < subir.length; i += 20) {
                var lote = subir.slice(i, i + 20).map(function (x) {
                    return { id: String(x.id), data: x, updated_at: new Date().toISOString() };
                });
                var r = await sb.from(t).upsert(lote);
                if (r.error) throw r.error;
                // marca o que já subiu: se falhar depois, não reenvia tudo de novo
                lote.forEach(function (x) { sbSnap[t][x.id] = JSON.stringify(x.data); });
            }
            if (apagar.length) {
                var d = await sb.from(t).delete().in("id", apagar);
                if (d.error) throw d.error;
            }
            sbSnap[t] = atual;
        }

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
    } catch (e) {
        console.warn("Supabase:", e);
        var rede = sbEhErroDeRede(e);
        sbFalhasSeguidas++;
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
    try {
        r = await sbCarregar();
    } catch (e) {
        return;   // sem rede agora: tenta de novo no próximo ciclo
    }
    if (!r || !Array.isArray(r) || !r[1] || !sbOnline) return;

    // (o filtro acima já evita atualizar com a folha ou o formulário abertos)
    ordens = sbLista(r[0]);
    usuarios = sbLista(r[1]);
    if (!usuarios.length) return;                            // servidor vazio: não apaga a equipe
    setores = Array.isArray(r[2]) && r[2].length ? r[2] : setores;
    eventos = sbLista(r[3]);
    avisos = sbLista(r[4]);
    empresa = (r[5] && typeof r[5] === "object") ? r[5] : empresa;
    estoque = sbLista(r[6]);
    compras = sbLista(r[7]);

    try {
        normalizar();
        if (!userPorId(sessao)) { sair(); return; }
        aplicarMarca();
        renderTudo();
    } catch (e) {
        console.warn("Falha ao atualizar a tela:", e);
    }
}

setInterval(sbAtualizar, 30000);

document.addEventListener("visibilitychange", function () {
    if (!document.hidden) sbAtualizar();
});

// Ao voltar a internet, sincroniza na hora
window.addEventListener("online", function () {
    sbFalhasSeguidas = 0;
    sbAtualizar();
});
