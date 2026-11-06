/* ==========================================
   SUPABASE - sincronização entre aparelhos
   Carregue este arquivo ANTES do script.js
========================================== */
var SB_URL = "https://xdnvouezqiyfccmbialn.supabase.co";
var SB_KEY = "sb_publishable_rkyc-FuleLowOaiqmVsAMQ_wOyE8eu_";
var SB_BUCKET = "fotos";

var sb = null;
var sbOnline = false;
var sbOcupado = false;
var sbEstOk = true;       // false se a tabela 'estoque' ainda não existir no Supabase
var sbAvisouEst = false;
var sbComOk = true;       // false se a tabela 'compras' ainda não existir no Supabase
var sbAvisouCom = false;
var sbSnap = { ordens: {}, usuarios: {}, eventos: {}, avisos: {}, estoque: {}, compras: {}, config: {} };

try {
    if (window.supabase) sb = window.supabase.createClient(SB_URL, SB_KEY);
} catch (e) { sb = null; }

function sbListas() {
    return { ordens: ordens, usuarios: usuarios, eventos: eventos, avisos: avisos, estoque: estoque, compras: compras };
}

function sbConfigAtual() {
    return { setores: setores, empresa: empresa };
}

function sbMapa(arr) {
    var m = {};
    (arr || []).forEach(function (x) { m[String(x.id)] = JSON.stringify(x); });
    return m;
}

/* ==========================================
   FOTOS -> Supabase Storage
   (no banco fica só o link da foto)
========================================== */
function sbEhDataUrl(s) {
    return typeof s === "string" && s.indexOf("data:image") === 0;
}

async function sbUpload(dataUrl, pasta) {
    var blob = await (await fetch(dataUrl)).blob();
    var ext = blob.type === "image/png" ? "png" : "jpg";
    var nome = pasta + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var r = await sb.storage.from(SB_BUCKET).upload(nome, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (r.error) throw r.error;
    return sb.storage.from(SB_BUCKET).getPublicUrl(nome).data.publicUrl;
}

async function sbSubirImagens() {
    var mudou = false;

    async function trocaLista(arr, pasta) {
        for (var i = 0; i < arr.length; i++) {
            if (!sbEhDataUrl(arr[i])) continue;
            var velho = arr[i];
            var url = await sbUpload(velho, pasta);
            var j = arr.indexOf(velho);          // pode ter sido removida durante o envio
            if (j !== -1) { arr[j] = url; mudou = true; }
        }
    }

    var os = ordens.slice();
    for (var a = 0; a < os.length; a++) {
        if (!os[a].fotos) continue;
        await trocaLista(os[a].fotos.antes, "os/" + os[a].id);
        await trocaLista(os[a].fotos.depois, "os/" + os[a].id);
    }

    var us = usuarios.slice();
    for (var b = 0; b < us.length; b++) {
        if (sbEhDataUrl(us[b].foto)) {
            var v = us[b].foto;
            var u = await sbUpload(v, "perfil");
            if (us[b].foto === v) { us[b].foto = u; mudou = true; }
        }
    }

    var es = estoque.slice();
    for (var c = 0; c < es.length; c++) {
        if (sbEhDataUrl(es[c].foto)) {
            var ve = es[c].foto;
            var ue = await sbUpload(ve, "estoque");
            if (es[c].foto === ve) { es[c].foto = ue; mudou = true; }
        }
    }

    if (sbEhDataUrl(empresa.logo)) {
        var vl = empresa.logo;
        var ul = await sbUpload(vl, "logo");
        if (empresa.logo === vl) { empresa.logo = ul; mudou = true; }
    }

    if (mudou) {   // guarda os links também neste aparelho
        kvSet("ordens", ordens);
        kvSet("usuarios", usuarios);
        kvSet("empresa", empresa);
        kvSet("estoque", estoque);
        if (typeof renderTudo === "function") { try { aplicarMarca(); renderTudo(); } catch (e) {} }
    }
}

/* ==========================================
   CARREGAR
========================================== */
function sbLocal() {
    return Promise.all([kvGet("ordens"), kvGet("usuarios"), kvGet("setores"), kvGet("eventos"), kvGet("avisos"), kvGet("empresa"), kvGet("estoque"), kvGet("compras")]);
}

async function sbCarregar() {
    if (!sb) return sbLocal();
    try {
        var out = {};
        var nomes = ["ordens", "usuarios", "eventos", "avisos"];
        for (var i = 0; i < nomes.length; i++) {
            var r = await sb.from(nomes[i]).select("data");
            if (r.error) throw r.error;
            out[nomes[i]] = r.data.map(function (x) { return x.data; });
        }
        try {
            var re = await sb.from("estoque").select("data");
            if (re.error) throw re.error;
            out.estoque = re.data.map(function (x) { return x.data; });
            sbEstOk = true;
        } catch (e2) {
            sbEstOk = false;
            out.estoque = (await kvGet("estoque")) || [];
            if (!sbAvisouEst) { sbAvisouEst = true; toast("Falta criar a tabela de estoque: rode o supabase.sql atualizado."); }
        }
        try {
            var rco = await sb.from("compras").select("data");
            if (rco.error) throw rco.error;
            out.compras = rco.data.map(function (x) { return x.data; });
            sbComOk = true;
        } catch (e3) {
            sbComOk = false;
            out.compras = (await kvGet("compras")) || [];
            if (!sbAvisouCom) { sbAvisouCom = true; toast("Falta criar a tabela de compras: rode o supabase.sql atualizado."); }
        }
        var c = await sb.from("config").select("k,v");
        if (c.error) throw c.error;
        var cfg = {};
        c.data.forEach(function (x) { cfg[x.k] = x.v; });

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
        sbOnline = true;

        // Banco vazio: aproveita o que já existe neste aparelho (ou cria os dados iniciais)
        if (!out.usuarios.length) return sbLocal();

        return [
            out.ordens,
            out.usuarios,
            cfg.setores || null,
            out.eventos,
            out.avisos,
            cfg.empresa || { nome: "", logo: "" },
            out.estoque,
            out.compras
        ];
    } catch (e) {
        sbOnline = false;
        toast("Sem conexão com o servidor. Usando dados deste aparelho.");
        return sbLocal();
    }
}

/* ==========================================
   ENVIAR (só o que mudou)
========================================== */
function sbSync() {
    if (!sb) return;
    clearTimeout(sbSync.h);
    sbSync.h = setTimeout(function () { sbSync.h = null; sbEnviar(); }, 500);
}

async function sbEnviar() {
    if (!sb || !sbOnline) return;
    if (sbOcupado) { sbSync(); return; }
    sbOcupado = true;
    try {
        await sbSubirImagens();

        var listas = sbListas();
        for (var t in listas) {
            if (t === "estoque" && !sbEstOk) continue;
            if (t === "compras" && !sbComOk) continue;
            var atual = sbMapa(listas[t]);
            var ant = sbSnap[t];
            var subir = listas[t].filter(function (x) { return ant[String(x.id)] !== atual[String(x.id)]; });
            var apagar = Object.keys(ant).filter(function (id) { return atual[id] === undefined; });

            for (var i = 0; i < subir.length; i += 20) {
                var lote = subir.slice(i, i + 20).map(function (x) {
                    return { id: String(x.id), data: x, updated_at: new Date().toISOString() };
                });
                var r = await sb.from(t).upsert(lote);
                if (r.error) throw r.error;
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
    } catch (e) {
        toast("Não foi possível sincronizar. Tentaremos de novo.");
        setTimeout(sbSync, 15000);
    }
    sbOcupado = false;
}

/* ==========================================
   BUSCAR MUDANÇAS DE OUTROS APARELHOS
========================================== */
async function sbAtualizar() {
    if (!sb || !sbOnline || sbOcupado || !user()) return;
    if (viewAtual === "nova" || $("sheet").classList.contains("on") || $("relTela").classList.contains("on")) return;
    if (sbSync.h) { clearTimeout(sbSync.h); sbSync.h = null; await sbEnviar(); }

    var r;
    try {
        r = await sbCarregar();
    } catch (e) {
        return;   // sem rede agora: tenta de novo no próximo ciclo
    }
    if (!r || !r[1] || !sbOnline) return;
    ordens = r[0] || [];
    usuarios = r[1];
    setores = r[2];
    eventos = r[3];
    avisos = r[4];
    empresa = r[5];
    estoque = r[6] || [];
    compras = r[7] || [];
    normalizar();
    if (!userPorId(sessao)) { sair(); return; }
    aplicarMarca();
    renderTudo();
}

setInterval(sbAtualizar, 30000);
document.addEventListener("visibilitychange", function () {
    if (!document.hidden) sbAtualizar();
});
