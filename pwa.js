/* ==========================================
   PWA - instalação do app no celular / computador
   Carregue este arquivo DEPOIS do script.js
========================================== */
var pwaEvento = null;

function pwaInstalado() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function pwaEhIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/* Cartão "Instalar aplicativo" na tela Perfil */
function pwaRender() {
    var box = document.getElementById("pwaCard");
    if (!box) return;

    if (pwaInstalado()) {
        box.style.display = "none";
        return;
    }
    box.style.display = "block";

    var corpo = document.getElementById("pwaCorpo");
    if (!corpo) return;

    if (pwaEvento) {
        corpo.innerHTML =
            '<p class="dica" style="margin:0 0 12px">Instale o app na tela inicial: abre em tela cheia, como um aplicativo, e continua abrindo mesmo com internet fraca.</p>' +
            '<button class="btn-pri cheio" style="margin-top:0" onclick="pwaInstalar()"><i class="fa-solid fa-download"></i> Instalar aplicativo</button>';
    } else if (pwaEhIOS()) {
        corpo.innerHTML =
            '<p class="dica" style="margin:0">No iPhone/iPad, abra este endereço no <b>Safari</b>, toque no botão <b>Compartilhar</b> ' +
            '<i class="fa-solid fa-arrow-up-from-bracket"></i> e escolha <b>Adicionar à Tela de Início</b>.</p>';
    } else {
        corpo.innerHTML =
            '<p class="dica" style="margin:0">Para instalar, abra o menu do navegador (⋮) e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>. ' +
            'No computador, procure o ícone de instalar na barra de endereço.</p>';
    }
}

function pwaInstalar() {
    if (!pwaEvento) return;
    pwaEvento.prompt();
    pwaEvento.userChoice.then(function (r) {
        if (r.outcome === "accepted") toast("Instalando o aplicativo...");
        pwaEvento = null;
        pwaRender();
    });
}

window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    pwaEvento = e;
    pwaRender();
});

window.addEventListener("appinstalled", function () {
    pwaEvento = null;
    pwaRender();
    toast("Aplicativo instalado ✔");
});

/* ==========================================
   AVISO DE VERSÃO NOVA
   O app guarda o nome da versão (v26, v27...) num banco do próprio navegador.
   Se o servidor entregar uma versão diferente da que está rodando, é porque
   saiu atualização. O técnico vê o aviso e toca em "Atualizar".
========================================== */
var pwaVersaoServidor = "";     // versão que está publicada no site
var pwaVersaoRodando = "";      // versão com que este app abriu

// Lê a versão publicada (sw.js é um arquivo pequeno e sempre vem da rede)
function pwaConferirVersao() {
    return fetch("sw.js?ver=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
            var m = /VERSAO\s*=\s*["']([^"']+)["']/.exec(txt);
            pwaVersaoServidor = m ? m[1] : "";
            if (pwaVersaoRodando) pwaGravarVersaoLida(true);
            pwaRenderAvisoVersao();
            return pwaVersaoServidor;
        })
        .catch(function () { return ""; });
}

function pwaVersaoDiferente() {
    return !!(pwaVersaoServidor && pwaVersaoRodando && pwaVersaoServidor !== pwaVersaoRodando);
}

// Guarda "esta versão já foi lida" (para o aviso não aparecer a cada abertura)
function pwaGravarVersaoLida(silencioso) {
    try {
        if (!silencioso) localStorage.setItem("mc_versao_lida", pwaVersaoServidor);
        else if (!localStorage.getItem("mc_versao_lida")) localStorage.setItem("mc_versao_lida", pwaVersaoRodando);
    } catch (e) {}
}

function pwaVersaoLida() {
    try { return localStorage.getItem("mc_versao_lida") || ""; } catch (e) { return ""; }
}

// Faixa no topo do app, só quando existe versão nova por instalar
function pwaRenderAvisoVersao() {
    var box = document.getElementById("avisoVersao");
    if (!box) return;
    if (!pwaVersaoDiferente()) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "";
    box.innerHTML =
        '<i class="fa-solid fa-cloud-arrow-down" style="margin-top:2px"></i>' +
        '<div><b>Atualização disponível</b><small>Toque em atualizar para receber as melhorias mais recentes.</small></div>' +
        '<button class="btn-pri" onclick="pwaAtualizarAgora()">Atualizar</button>';
}

// Botão Atualizar: limpa o cache do app e recarrega
function pwaAtualizarAgora() {
    pwaVersaoServidor = "";     // marca a versão nova como lida depois de atualizar
    function recarregar() {
        try { localStorage.setItem("mc_versao_lida", "atualizando"); } catch (e) {}
        location.replace(location.pathname + "?v=" + Date.now());
    }
    if (!("serviceWorker" in navigator)) return recarregar();
    toast("Baixando a versão nova...");
    navigator.serviceWorker.getRegistrations()
        .then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister().catch(function () {}); }));
        })
        .then(function () {
            return ("caches" in window) ? caches.keys().then(function (ns) {
                return Promise.all(ns.map(function (n) { return caches.delete(n).catch(function () {}); }));
            }) : null;
        })
        .then(recarregar)
        .catch(recarregar);
}

/* ==========================================
   TELA "ATUALIZAÇÕES E CONEXÃO" (Perfil)
   Mostra, em linguagem simples, se este celular está com a versão nova e se
   as OS estão chegando ao banco. Disponível para todos os técnicos.
========================================== */
function abrirStatusApp() {
    if (typeof user !== "function" || !user()) return;
    var ok = typeof sbOnline !== "undefined" && sbOnline;
    var semLib = (typeof sb === "undefined") || !sb;
    var rtOk = (typeof sbRtOk === "undefined") ? null : sbRtOk;
    var ultimo = (typeof sbUltimoEnvio === "number" && sbUltimoEnvio) ? fmtTs(sbUltimoEnvio) : "—";
    var pend = 0;
    try { pend = (typeof sbPendentes === "function") ? sbPendentes() : 0; } catch (e) { pend = 0; }

    var nova = pwaVersaoDiferente();

    function linha(ok, titulo, detalhe) {
        return '<div class="conf-linha ' + (ok ? "ok" : "ruim") + '">' +
            '<i class="fa-solid ' + (ok ? "fa-circle-check" : "fa-circle-exclamation") + '"></i>' +
            '<div><b>' + titulo + '</b><small>' + detalhe + '</small></div></div>';
    }

    var h = '<div class="sheet-alca"></div><h2>Atualizações e conexão</h2>' +

        '<div class="form-titulo" style="margin-top:0"><i class="fa-solid fa-mobile-screen-button"></i> Versão do app</div>' +
        (nova
            ? linha(false, "Versão nova disponível", "Seu app está em " + pwaVersaoRodando + " e já existe a " + pwaVersaoServidor + ".") +
              '<button class="btn-pri cheio" onclick="pwaAtualizarAgora()"><i class="fa-solid fa-cloud-arrow-down"></i> Baixar atualização agora</button>' +
              '<p class="dica">Depois de atualizar, o app fecha e abre sozinho. Demora alguns segundos.</p>'
            : linha(true, "Seu app está atualizado", pwaVersaoRodando ? "Versão instalada: " + pwaVersaoRodando + "." : "Versão não informada pelo navegador.")) +

        '<div class="form-titulo"><i class="fa-solid fa-cloud-arrow-up"></i> Sincronização</div>' +
        linha(!semLib, semLib ? "Supabase não carregou" : "Conectado ao banco",
              semLib ? "Sem internet ou bloqueio do aparelho. As OS ficam salvas aqui até conseguir." : "Endereço e chave do banco estão corretos.") +
        linha(ok, ok ? "Dados sincronizados" : "Ainda não sincronizado",
              ok ? "Último envio: " + ultimo + ". Nada pendente."
                 : "Os dados continuam salvos neste aparelho e sobem quando a internet voltar.") +
        (pend ? linha(false, pend + (pend === 1 ? " OS ainda neste aparelho" : " OS ainda neste aparelho"),
              "Aguardando envio. Toque em Testar agora para enviar já.") : "") +
        linha(rtOk, rtOk === null ? "Aviso ao vivo: testando" : (rtOk ? "Aviso ao vivo ligado" : "Aviso ao vivo desligado"),
              rtOk ? "As OS dos colegas aparecem em segundos." : "Sem aviso instantâneo: o app busca as novidades a cada minuto.") +

        '<div class="sheet-acoes" style="margin-top:14px">' +
            '<button class="btn-sec" onclick="testarConexao()"><i class="fa-solid fa-plug-circle-check"></i> Testar agora</button>' +
            '<button class="btn-pri" onclick="fecharOS()">Fechar</button>' +
        '</div>';

    var folha = document.getElementById("sheet");
    if (!folha) return;
    folha.innerHTML = h;
    document.getElementById("overlay").classList.add("on");
    folha.classList.add("on");
    document.body.classList.add("folha-aberta");
    folha.scrollTop = 0;

    pwaConferirVersao();   // aproveita para conferir a versão publicada
}

// Escreve o resumo no cartão do Perfil ("Tudo sincronizado" / "Versão nova disponível")
function pwaRenderMenuStatus() {
    var el = document.getElementById("mcStatusApp");
    if (!el) return;
    if (pwaVersaoDiferente()) {
        el.textContent = "Versão nova disponível: toque para atualizar";
        el.classList.add("alerta");
        return;
    }
    var ok = typeof sbOnline !== "undefined" && sbOnline;
    var pend = 0;
    try { pend = (typeof sbPendentes === "function") ? sbPendentes() : 0; } catch (e) { pend = 0; }
    el.classList.toggle("alerta", !ok || pend > 0);
    el.textContent = !ok ? "Sem conexão com o banco: toque para ver"
        : pend ? pend + " OS aguardando envio: toque para ver"
        : "App atualizado e OS sincronizadas";
}

// Atualiza o cartão ao abrir o Perfil (junto com o cartão de instalação)
var pwaIrOriginal = ir;
ir = function (nome) {
    pwaIrOriginal(nome);
    if (nome === "perfil") {
        pwaRender();
        pwaRenderMenuStatus();
        pwaConferirVersao();
    }
};

/* Service worker (só funciona em https ou localhost) */
var pwaRegistro = null;
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").then(function (reg) {
            pwaRegistro = reg;
            // Pergunta ao servidor se saiu versão nova (a cada 15 min e ao abrir)
            pwaConferirVersao();
            setInterval(function () {
                try { reg.update(); } catch (e) {}
                pwaConferirVersao();
            }, 15 * 60 * 1000);
        }).catch(function () {
            pwaConferirVersao();
        });
    });

    // Quando uma versão nova assume o controle, avisa e oferece recarregar.
    // Antes: recarregava sozinho (o técnico perdia o que estava digitando).
    navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (viewAtual === "nova" || (document.getElementById("sheet") && document.getElementById("sheet").classList.contains("on"))) {
            toast("Versão nova pronta: feche esta tela e atualize");
        }
        pwaRenderAvisoVersao();
    });
}

// Descobre com que versão o app abriu e confere se há outra publicada
// (pergunta ao service worker, que sabe qual versão está instalada no aparelho)
try {
    pwaVersaoRodando = localStorage.getItem("mc_versao_rodando") || "";
} catch (e) {}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (ev) {
        if (!ev.data || ev.data.tipo !== "versao" || !ev.data.versao) return;
        pwaVersaoRodando = ev.data.versao;
        try { localStorage.setItem("mc_versao_rodando", pwaVersaoRodando); } catch (e) {}
        pwaRenderAvisoVersao();
        pwaRenderMenuStatus();
    });
    navigator.serviceWorker.ready.then(function (reg) {
        if (reg.active) reg.active.postMessage({ tipo: "versao" });
    }).catch(function () {});
    setTimeout(function () {
        var c = navigator.serviceWorker.controller;
        if (c) c.postMessage({ tipo: "versao" });
    }, 1500);
}

pwaRender();
pwaRenderAvisoVersao();

