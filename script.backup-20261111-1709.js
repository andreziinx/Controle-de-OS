/* ==========================================
   CONSTANTES
========================================== */
var STAT = {
    aguardando: { t: "Não iniciada",      c: "s-aguardando" },
    andamento:  { t: "Em andamento",      c: "s-andamento" },
    final:      { t: "Finalizada",        c: "s-final" }
};

var PRIOR = {
    baixa:   { t: "Baixa",   c: "p-baixa",   k: "pb" },
    media:   { t: "Média",   c: "p-media",   k: "pm" },
    alta:    { t: "Alta",    c: "p-alta",    k: "pa" },
    urgente: { t: "Urgente", c: "p-urgente", k: "pu" }
};

var TIPOS = ["Corretiva", "Preventiva", "Preditiva", "Melhoria"];
var SETORES_PADRAO = ["Produção", "Elétrica", "Mecânica", "Utilidades", "Logística", "Outro"];
var TIPOS_EVENTO = ["Manutenção preventiva", "Inspeção", "Parada programada", "Reunião", "Treinamento", "Outro"];
var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
var DIAS = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
var MAX_FOTOS = 8;
var UNIDADES = ["un", "m", "kg", "L", "cx", "par", "rolo"];

// Categorias de peças (o líder pode digitar uma nova no cadastro)
var CATEGORIAS = [
    "Rolamentos", "Parafusos e porcas", "Vedações e retentores", "Correias e polias",
    "Mangueiras e conexões", "Elétrica", "Lubrificantes", "Ferramentas",
    "Filtros", "EPI", "Outros"
];

/* ==========================================
   ESTADO
========================================== */
var usuarios = [];
var ordens = [];
var setores = [];
var eventos = [];
var avisos = [];
var estoque = [];
var compras = [];
var formItens = [];
var empresa = { nome: "", logo: "" };
var sessao = null;
var DB = null;
var viewAtual = "inicio";
var filtro = "todas";
var soMinhas = false;
var calMes = new Date();
calMes.setDate(1);
var calSel = hoje();
var formFotos = { antes: [], depois: [] };
var formAssin = "";   // assinatura do técnico no formulário (imagem)
var pickCtx = null;
var loginSel = null;
var edId = null;
var edFoto = "";

/* ==========================================
   UTILITÁRIOS
========================================== */
function $(id) { return document.getElementById(id); }

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Texto sem acentos e em minúsculas: a busca do estoque acha "valvula" e "válvula"
function semAcento(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t;
}

function iso(d) {
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
}

function hoje() { return iso(new Date()); }

function somaDias(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return iso(d);
}

function dataDe(s) {
    var p = s.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function diasAte(s) {
    var a = new Date();
    a.setHours(0, 0, 0, 0);
    return Math.round((dataDe(s) - a) / 86400000);
}

function fmtData(s) {
    if (!s) return "—";
    var p = String(s).split("-");
    if (p.length < 3) return String(s);
    return p[2] + "/" + p[1] + "/" + p[0];
}

function num(id) { return "#" + String(id).padStart(4, "0"); }

function horaAgora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// "12/03/2026 às 16:33" (sem hora, mostra só a data: OS antigas não têm hora)
function fmtDataHoraOS(data, hora) {
    return fmtData(data) + (hora ? " às " + hora : "");
}

function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.classList.remove("on"); }, 2600);
}

function user() {
    return usuarios.filter(function (u) { return u.id === sessao; })[0];
}

function ehAdmin() {
    var u = user();
    return !!u && u.papel === "admin";
}

function ehCompras() {
    var u = user();
    return !!u && u.papel === "compras";
}

function userPorId(id) {
    return usuarios.filter(function (x) { return x.id === id; })[0];
}

function nomeDe(id) {
    var u = userPorId(id);
    return u ? u.nome : "(removido)";
}

function inicialDe(nome) { return (nome || "?").trim().charAt(0).toUpperCase(); }

function atrasada(o) {
    return o.status !== "final" && o.data && o.data < hoje();
}

function buscar(id) {
    id = Number(id);
    return ordens.filter(function (o) { return o.id === id; })[0];
}

function buscarEv(id) {
    id = Number(id);
    return eventos.filter(function (e) { return e.id === id; })[0];
}

function proximoId(lista) {
    return lista.length ? Math.max.apply(null, lista.map(function (x) { return x.id; })) + 1 : 1;
}

function tecnicos() {
    return usuarios.filter(function (u) { return u.papel === "tecnico"; });
}

function paraMim(e) {
    return ehAdmin() || e.para === "todos" || e.para === sessao;
}

// Preenche um elemento de avatar (letra ou foto)
function setAvatar(el, u) {
    if (!el) return;
    if (u && u.foto) {
        el.classList.add("tem-foto");
        el.style.backgroundImage = "url(" + u.foto + ")";
        el.textContent = "";
    } else {
        el.classList.remove("tem-foto");
        el.style.backgroundImage = "";
        el.textContent = inicialDe(u ? u.nome : "?");
    }
}

function avatarHTML(u, cls) {
    if (u && u.foto) return '<div class="' + cls + ' tem-foto" style="background-image:url(' + u.foto + ')"></div>';
    return '<div class="' + cls + '">' + esc(inicialDe(u ? u.nome : "?")) + "</div>";
}

/* ==========================================
   ARMAZENAMENTO (IndexedDB, com plano B)
========================================== */
function abrirDB() {
    return new Promise(function (res) {
        try {
            if (!window.indexedDB) { res(); return; }   // navegador sem IndexedDB: usa o plano B
            var r = indexedDB.open("manutencao", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
            r.onsuccess = function () { DB = r.result; res(); };
            r.onerror = function () { DB = null; res(); };
            r.onblocked = function () { DB = null; res(); };   // outra aba segurando o banco
        } catch (e) { DB = null; res(); }
    });
}

function kvGet(k) {
    return new Promise(function (res) {
        var doLocal = function () {
            try { res(JSON.parse(localStorage.getItem(k))); } catch (e) { res(); }
        };
        if (DB) {
            try {
                var q = DB.transaction("kv").objectStore("kv").get(k);
                // antes: se o IndexedDB falhasse, a leitura não devolvia nada
                // e o app ficava parado na tela de carregamento
                q.onsuccess = function () { res(q.result); };
                q.onerror = doLocal;
            } catch (e) { doLocal(); }
        } else {
            doLocal();
        }
    });
}

function kvSet(k, v) {
    if (DB) {
        try { DB.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) {}
    } else {
        try { localStorage.setItem(k, JSON.stringify(v)); }
        catch (e) { toast("Memória cheia: não foi possível salvar"); }
    }
}

function salvar() {
    kvSet("ordens", ordens);
    kvSet("usuarios", usuarios);
    kvSet("setores", setores);
    kvSet("eventos", eventos);
    kvSet("avisos", avisos);
    kvSet("empresa", empresa);
    kvSet("estoque", estoque);
    kvSet("compras", compras);
    if (typeof sbSync === "function") sbSync();
}

function dadosIniciais() {
    usuarios = [
        { id: 1, nome: "Líder",  papel: "admin",   pin: "1234", funcao: "Líder de Manutenção", tel: "", foto: "" },
        { id: 2, nome: "André",  papel: "tecnico", pin: "1111", funcao: "Técnico Mecânico",    tel: "", foto: "" },
        { id: 3, nome: "Marcos", papel: "tecnico", pin: "1111", funcao: "Eletricista",         tel: "", foto: "" },
        { id: 4, nome: "Carlos", papel: "tecnico", pin: "1111", funcao: "Técnico de Utilidades", tel: "", foto: "" }
    ];
    ordens = [
        { id: 1, titulo: "Motor da Esteira 01", setor: "Produção",   tipo: "Corretiva",  prior: "urgente", origem: "designada", tecId: 2, criadaPor: 1, data: somaDias(-2), status: "aguardando", desc: "Motor aquecendo e desarmando o disjuntor.", criada: somaDias(-5) },
        { id: 2, titulo: "Compressor de Ar",    setor: "Utilidades", tipo: "Preventiva", prior: "media",   origem: "designada", tecId: 3, criadaPor: 1, data: hoje(),       status: "andamento",  desc: "Troca de filtros e verificação de óleo.",   criada: somaDias(-3), aceitaEm: somaDias(-1) },
        { id: 3, titulo: "Painel Elétrico",     setor: "Elétrica",   tipo: "Preditiva",  prior: "alta",    origem: "designada", tecId: 2, criadaPor: 1, data: somaDias(2),  status: "aguardando", desc: "Termografia dos barramentos.",               criada: somaDias(-1) },
        { id: 4, titulo: "Empilhadeira 02",     setor: "Logística",  tipo: "Preventiva", prior: "media",   origem: "campo",     tecId: 4, criadaPor: 4, data: somaDias(-1), status: "final",      desc: "Troca do filtro hidráulico e lubrificação.", criada: somaDias(-1), concluida: somaDias(-1) }
    ];
    setores = SETORES_PADRAO.slice();
    eventos = [
        { id: 1, titulo: "Parada programada - Linha 2", data: somaDias(2), hora: "07:00", tipo: "Parada programada", para: "todos", desc: "Todos os técnicos na linha às 07h.", criadoPor: 1, criadoEm: Date.now() }
    ];
}

function normalizar() {
    desembrulharListas();
    ordens.forEach(function (o) {
        if (!o.fotos) o.fotos = { antes: [], depois: [] };
        if (!o.itens) o.itens = [];
    });
    usuarios.forEach(function (u) {
        if (!u.funcao) u.funcao = u.papel === "admin" ? "Líder de Manutenção" : (u.papel === "compras" ? "Compras" : "Técnico de Manutenção");
        if (u.tel == null) u.tel = "";
        if (u.foto == null) u.foto = "";
    });
    if (!setores || !setores.length) setores = SETORES_PADRAO.slice();
    // Um setor vazio/estranho gravado antes derrubava a tela toda (indexOf de undefined)
    setores = setores.filter(function (s) { return typeof s === "string" && s.trim() !== ""; });
    if (!setores.length) setores = SETORES_PADRAO.slice();
    ordens.forEach(function (o) {
        if (!o.setor) o.setor = "Outro";
        if (setores.indexOf(o.setor) === -1) setores.push(o.setor);
    });
    if (!eventos) eventos = [];
    if (!empresa || typeof empresa !== "object") empresa = { nome: "", logo: "" };
    if (!empresa.nome) empresa.nome = "";
    if (!empresa.logo) empresa.logo = "";
    if (!empresa.meta) empresa.meta = 0;
    if (!avisos) avisos = [];
    if (!estoque) estoque = [];
    if (!compras) compras = [];
    estoque.forEach(function (e) {
        if (!e) return;
        if (e.nome == null) e.nome = "";
        e.nome = String(e.nome);
        e.qtd = Number(e.qtd) || 0;
        e.min = Number(e.min) || 0;
        if (!e.un) e.un = "un";
        if (e.caixa == null) e.caixa = "";
        if (e.rua == null) e.rua = "";
        if (e.lado == null) e.lado = "";
        if (e.nivel == null) e.nivel = "";
        if (e.codigo == null) e.codigo = "";
        if (!e.cat) e.cat = "";
        e.max = Number(e.max) || 0;
        if (e.forn == null) e.forn = "";
        // Peças antigas tinham um local só: vira uma lista de locais
        if (!e.locais || !e.locais.length) {
            e.locais = (e.rua || e.local) ? [{
                rua: e.rua || "", lado: e.lado || "", nivel: e.nivel || "",
                caixa: e.caixa || "", qtd: e.qtd || 0, local: e.local || ""
            }] : [];
        }
    });
    compras.forEach(function (c) {
        if (!c.receb) c.receb = [];
        c.qtd = Number(c.qtd) || 0;
        if (!c.prior) c.prior = c.urgente ? "urgente" : "normal";
    });

    // descarta avisos com mais de 30 dias
    var limite = Date.now() - 30 * 86400000;
    avisos = avisos.filter(function (a) { return a.em > limite; });
}

// Já aconteceu de uma lista chegar embrulhada: [ [ item, item ] ] em vez de
// [ item, item ]. O app então "lia" a lista interna como se fosse um registro
// sem nome (a tela quebrava ao abrir a lista). Aqui a lista é desembrulhada.
function desembrulharListas() {
    function plano(l) {
        var guarda = 0;
        while (Array.isArray(l) && l.length === 1 && Array.isArray(l[0]) && guarda < 5) {
            l = l[0];
            guarda++;
        }
        return l;
    }
    ordens  = plano(ordens) || [];
    usuarios = plano(usuarios) || [];
    eventos = plano(eventos) || [];
    avisos  = plano(avisos) || [];
    estoque = plano(estoque) || [];
    compras = plano(compras) || [];
    // fora listas, descarta qualquer registro que não seja objeto
    function soObjetos(l) {
        return (l || []).filter(function (x) { return x && typeof x === "object" && !Array.isArray(x); });
    }
    ordens = soObjetos(ordens);
    usuarios = soObjetos(usuarios);
    eventos = soObjetos(eventos);
    avisos = soObjetos(avisos);
    estoque = soObjetos(estoque);
    compras = soObjetos(compras);
}

/* ==========================================
   LOGIN / SESSÃO
========================================== */
function renderLogin() {
    var q = $("loginBusca").value.trim().toLowerCase();

    var lista = usuarios.filter(function (u) {
        if (!q) return true;
        return (u.nome + " " + u.funcao).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
        if (a.papel !== b.papel) return a.papel === "admin" ? -1 : 1;   // líder primeiro
        return a.nome.localeCompare(b.nome, "pt-BR");
    });

    if (!lista.length) {
        $("loginUsers").innerHTML = '<div class="login-vazio">Nenhum usuário encontrado.</div>';
        return;
    }

    $("loginUsers").innerHTML = lista.map(function (u) {
        return '<button class="login-item' + (u.papel === "admin" ? " admin" : "") + '" onclick="selecionarLogin(' + u.id + ')">' +
            avatarHTML(u, "av") +
            '<span class="login-item-tx"><b>' + esc(u.nome) + '</b><small>' + (u.papel === "admin" ? "Líder · " : "") + esc(u.funcao) + '</small></span>' +
            '<i class="fa-solid fa-chevron-right"></i></button>';
    }).join("");
}

function aplicarMarca() {
    var temLogo = !!empresa.logo;

    var box = $("loginLogo");
    box.classList.toggle("tem-logo", temLogo);
    box.innerHTML = temLogo
        ? '<img src="' + empresa.logo + '" alt="Logo">'
        : '<i class="fa-solid fa-screwdriver-wrench"></i>';

    $("loginEmpresa").textContent = empresa.nome || "Controle de Manutenção";

    var t = $("topoLogo");
    t.style.display = temLogo ? "block" : "none";
    if (temLogo) t.src = empresa.logo; else t.removeAttribute("src");
    $("topo").classList.toggle("com-logo", temLogo);
}

function mostrarLogin() {
    loginSel = null;
    $("loginBusca").value = "";
    $("loginPin").style.display = "none";
    $("loginEscolha").style.display = "block";
    $("login").classList.add("on");
    aplicarMarca();
    renderLogin();
}

function selecionarLogin(id) {
    var u = userPorId(id);
    if (!u) return;
    loginSel = id;
    $("loginAv").className = "login-av";
    setAvatar($("loginAv"), u);
    $("loginNome").textContent = u.nome;
    $("loginFuncao").textContent = u.papel === "admin" ? "Líder · " + u.funcao : u.funcao;
    $("pinInput").value = "";
    $("loginErro").classList.remove("on");
    $("loginEscolha").style.display = "none";
    $("loginPin").style.display = "block";
    $("pinInput").focus();
}

function voltarLogin() {
    loginSel = null;
    $("loginPin").style.display = "none";
    $("loginEscolha").style.display = "block";
    $("loginBusca").focus();
}

function entrar() {
    var u = userPorId(loginSel);
    if (!u) return;
    if ($("pinInput").value !== u.pin) {
        $("loginErro").classList.add("on");
        $("pinInput").value = "";
        $("pinInput").classList.remove("treme");
        void $("pinInput").offsetWidth;
        $("pinInput").classList.add("treme");
        $("pinInput").focus();
        return;
    }
    iniciarSessao(u.id);
}

function iniciarSessao(id) {
    sessao = id;
    try { localStorage.setItem("mc_sessao", String(id)); } catch (e) {}
    var adm = ehAdmin();
    document.body.classList.toggle("papel-admin", adm);
    document.body.classList.toggle("papel-tec", !adm && !ehCompras());
    document.body.classList.toggle("papel-compras", ehCompras());
    $("login").classList.remove("on");
    aplicarMarca();
    filtro = "todas";
    soMinhas = false;
    calSel = hoje();
    calMes = new Date();
    calMes.setDate(1);
    montarSelects();
    ir(ehCompras() ? "p-compras" : "inicio");
    setTimeout(notificarSistema, 1200);
}

function sair() {
    try { localStorage.removeItem("mc_sessao"); } catch (e) {}
    sessao = null;
    fecharOS();
    mostrarLogin();
}

/* ==========================================
   NAVEGAÇÃO
========================================== */
function cabecalho(nome) {
    var adm = ehAdmin();
    var u = user();   // pode não existir (ex.: menu do perfil clicado durante o login)
    if (nome === "inicio") {
        var fest = u && aniversariantesDoDia(hoje()).some(function (x) { return x.id === u.id; });
        return [dataLonga(new Date()), fest ? "🎉 Parabéns, " + u.nome + ", pelo seu dia!"
            : saudacao() + (u ? ", " + u.nome + " · " + (adm ? "Painel do líder" : "Painel do técnico") : "")];
    }
    if (nome === "os")         return ["Ordens de Serviço", ordens.length + " ordens cadastradas"];
    if (nome === "calendario") return ["Calendário", "Prazos, serviços e eventos"];
    if (nome === "perfil")     return ["Meu Perfil", u ? u.funcao : ""];
    if (nome === "p-equipe")   return ["Equipe", "Pessoas e acessos"];
    if (nome === "p-estoque")  return ["Estoque", "Almoxarifado"];
    if (nome === "p-peca")     return ["Peça", (pecaAberta && estItem(pecaAberta)) ? estItem(pecaAberta).nome : "Estoque · almoxarifado"];
    if (nome === "p-compras")  return ["Compras", "Solicitações e pedidos"];
    if (nome === "p-empresa")  return ["Empresa", "Logo e nome"];
    if (nome === "p-setores")  return ["Setores", "Locais de atendimento"];
    if (nome === "p-dados")    return ["Dados", "Backup e limpeza"];
    if (nome === "nova") {
        var ed = $("fId").value;
        if (ed) return ["Editar OS", "OS " + num(ed)];
        return (adm || modoDesig) ? ["Nova OS", "Designar para um técnico"] : ["Registrar serviço", "Relatório de campo com fotos"];
    }
    return ["", ""];
}

function ir(nome) {
    if (!user()) return;   // sem sessão (tela de login) não troca de tela
    if (ehCompras() && ["inicio", "os", "calendario", "nova"].indexOf(nome) !== -1) nome = "p-compras";
    if (nome.indexOf("p-") === 0 && !ehAdmin() && !(nome === "p-compras" && ehCompras()) && nome !== "p-estoque" && nome !== "p-peca") nome = "perfil";
    viewAtual = nome;

    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("ativa"); });
    var alvo = $("v-" + nome);
    if (!alvo) return;
    alvo.classList.add("ativa");

    document.querySelectorAll(".bottom-nav button[data-view]").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-view") === (nome === "p-compras" && ehCompras() ? "compras" : nome.indexOf("p-") === 0 ? "perfil" : nome));
    });

    var compacto = nome === "nova";
    $("topo").classList.toggle("compacto", compacto);
    $("topo").classList.toggle("inicio", nome === "inicio");

    var c = cabecalho(nome);
    if (nome === "inicio") {
        $("topoTitulo").innerHTML = '<span id="topoData"></span><span class="topo-hora" id="topoHora"></span>';
        $("topoSub").textContent = c[1];
        atualizarRelogio();
    } else {
        $("topoTitulo").textContent = c[0];
        $("topoSub").textContent = c[1];
    }

    $("topoAvatar").style.display = compacto ? "none" : "flex";
    $("sino").style.display = compacto ? "none" : "block";
    if ($("sinc")) $("sinc").style.display = compacto ? "none" : "";
    setAvatar($("topoAvatar"), user());

    // Se o desenho de uma tela falhar, a navegação continua funcionando
    // (antes, um erro aqui deixava a tela travada e o botão Voltar sem efeito)
    try {
        renderTudo();
    } catch (e) {
        toast("Não foi possível atualizar a tela. Feche e abra o app.");
    }
    window.scrollTo(0, 0);
}

/* ==========================================
   ESTADO DA CONEXÃO COM O BANCO
   O indicador do topo fica SEMPRE escondido (o usuário não quis ícone ali).
   A tela de diagnóstico continua disponível em abrirDadosConexao().
   Esta função só mantém o selo do avatar escondido, para o caso de alguém
   reativá-lo no HTML no futuro.
========================================== */
function atualizarSinc() {
    var b = $("sinc");
    if (!b) return;
    b.classList.remove("on", "offline", "online", "enviando");
}

// Tela explicando a conexão (Perfil > Dados e backup > Conexão com o banco)
function abrirDadosConexao() {
    var semServidor = (typeof sb === "undefined") || !sb;
    var online = typeof sbOnline !== "undefined" && sbOnline;
    var estOk = typeof sbEstOk === "undefined" || sbEstOk;
    var comOk = typeof sbComOk === "undefined" || sbComOk;
    var ultimo = (typeof sbUltimoEnvio === "number" && sbUltimoEnvio) ? fmtTs(sbUltimoEnvio) : "—";

    function linha(ok, titulo, detalhe) {
        return '<div class="conf-linha ' + (ok ? "ok" : "ruim") + '">' +
            '<i class="fa-solid ' + (ok ? "fa-circle-check" : "fa-circle-exclamation") + '"></i>' +
            '<div><b>' + titulo + '</b><small>' + detalhe + '</small></div></div>';
    }

    var h = '<div class="sheet-alca"></div><h2>Conexão com o banco</h2>' +
        linha(!semServidor, semServidor ? "Biblioteca do Supabase não carregou" : "Conexão configurada",
              semServidor ? "Abra o app com internet pelo menos uma vez." : "Endereço e chave do projeto estão preenchidos.") +
        linha(online, online ? "Servidor alcançável" : "Servidor não alcançado",
              online ? "Os dados deste aparelho estão sincronizados." : "Os dados continuam salvos aqui e serão enviados quando a internet voltar.") +
        linha(estOk, estOk ? "Tabela de estoque" : "Tabela de estoque ausente",
              estOk ? "Disponível no servidor." : "Rode o supabase.sql no Supabase para sincronizar o estoque.") +
        linha(comOk, comOk ? "Tabela de compras" : "Tabela de compras ausente",
              comOk ? "Disponível no servidor." : "Rode o supabase.sql no Supabase para sincronizar as compras.") +
        '<p class="dica" style="margin:10px 0 0">Último envio concluído: <b>' + esc(ultimo) + '</b></p>' +
        '<h4>Se algo não sincronizar</h4>' +
        '<p class="dica" style="margin:0 0 10px">1. Confira a internet do aparelho.<br>' +
        '2. No Supabase, abra o SQL Editor e rode o conteúdo de <b>supabase.sql</b> (cria tabelas, permissões e o espaço de fotos).<br>' +
        '3. As fotos precisam do bucket <b>fotos</b>; sem ele, o resto continua funcionando.</p>' +
        '<div class="sheet-acoes"><button class="btn-sec" onclick="testarConexao()"><i class="fa-solid fa-plug-circle-check"></i> Testar agora</button>' +
        '<button class="btn-pri" style="margin-top:0" onclick="fecharOS()">Fechar</button></div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

// Teste de verdade: lê uma linha de cada tabela e diz o que respondeu
function testarConexao() {
    if (typeof sb === "undefined" || !sb) { toast("Supabase não carregou: verifique a internet"); return; }
    toast("Testando a conexão...");
    var tabelas = ["ordens", "usuarios", "eventos", "avisos", "estoque", "compras", "config"];
    var resultados = [];
    var fila = tabelas.slice();

    function proxima() {
        if (!fila.length) { fim(); return; }
        var t = fila.shift();
        sb.from(t).select("*").limit(1).then(function (r) {
            resultados.push({ t: t, ok: !r.error, msg: r.error ? sbMotivoErro(r.error) : "ok" });
            proxima();
        }).catch(function (e) {
            resultados.push({ t: t, ok: false, msg: sbMotivoErro(e) });
            proxima();
        });
    }

    function fim() {
        var ruins = resultados.filter(function (x) { return !x.ok; });
        var h = '<div class="sheet-alca"></div><h2>Resultado do teste</h2>';
        h += resultados.map(function (x) {
            return '<div class="conf-linha ' + (x.ok ? "ok" : "ruim") + '">' +
                '<i class="fa-solid ' + (x.ok ? "fa-circle-check" : "fa-circle-exclamation") + '"></i>' +
                '<div><b>' + x.t + '</b><small>' + esc(x.ok ? "Respondeu normalmente." : x.msg) + '</small></div></div>';
        }).join("");
        h += '<p class="dica" style="margin:10px 0 0">' + (ruins.length
            ? "Revise os itens acima no Supabase. O app continua funcionando com os dados deste aparelho."
            : "Tudo certo: o banco respondeu em todas as tabelas.") + '</p>' +
            '<div class="sheet-acoes um"><button class="btn-pri" style="margin-top:0" onclick="fecharOS()">Fechar</button></div>';
        $("sheet").innerHTML = h;
        $("overlay").classList.add("on");
        $("sheet").classList.add("on");
        document.body.classList.add("folha-aberta");
        if (typeof sbAtualizar === "function") setTimeout(sbAtualizar, 200);
    }

    proxima();
}

function saudacao() {
    var h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function renderTudo() {
    if (!user()) return;
    if (viewAtual === "inicio")     renderInicio();
    if (viewAtual === "os")         renderOS();
    if (viewAtual === "calendario") renderCalendario();
    if (viewAtual === "perfil")     renderPerfil();
    if (viewAtual === "p-peca")     renderPeca();
    if (viewAtual.indexOf("p-") === 0) renderSub();
    atualizarSino();
    atualizarSinc();
    setTimeout(conferirConquistas, 500);
}

/* ==========================================
   AVISOS (OS atrasadas / a vencer / eventos)
========================================== */
function lidosKey() { return "mc_lidos_" + sessao; }

function getLidos() {
    try { return JSON.parse(localStorage.getItem(lidosKey()) || "[]"); } catch (e) { return []; }
}

function naoLidos() {
    var l = getLidos();
    return alertas().filter(function (a) { return l.indexOf(a.key) === -1; });
}

function dispKey() { return "mc_disp_" + sessao; }

function getDispensados() {
    try { return JSON.parse(localStorage.getItem(dispKey()) || "[]"); } catch (e) { return []; }
}

function dispensarAlertas(keys) {
    var d = getDispensados();
    keys.forEach(function (k) { if (d.indexOf(k) === -1) d.push(k); });
    try { localStorage.setItem(dispKey(), JSON.stringify(d.slice(-500))); } catch (e) {}
}

function marcarLidos() {
    var l = getLidos();
    alertas().forEach(function (a) { if (l.indexOf(a.key) === -1) l.push(a.key); });
    try { localStorage.setItem(lidosKey(), JSON.stringify(l.slice(-300))); } catch (e) {}
}

// Agrupa os avisos idênticos (ex.: várias "Nova OS para você" seguidas viram um aviso só)
function agruparAlertas(lista) {
    var ordem = [], mapa = {};
    lista.forEach(function (a) {
        var k = a.t + "|" + a.s;
        if (!mapa[k]) { mapa[k] = a; mapa[k].n = 1; mapa[k].keys = [a.key]; ordem.push(k); }
        else { mapa[k].n++; mapa[k].keys.push(a.key); }
    });
    return ordem.map(function (k) {
        var a = mapa[k];
        if (a.n > 1) a.t = a.t + " (" + a.n + ")";
        return a;
    });
}

function alertas() {
    var lista = [];
    var adm = ehAdmin();
    var recente = Date.now() - 3 * 86400000;

    ordens.forEach(function (o) {
        if (o.status === "final" || !o.data) return;
        var minha = o.tecId === sessao;
        if (!adm && !minha) return;

        var d = diasAte(o.data);
        var quem = adm ? " · " + nomeDe(o.tecId) : "";
        var rot = "OS " + num(o.id);

        if (d < 0) {
            lista.push({ key: "a" + o.id, nivel: 4, cor: "verm", ic: "fa-triangle-exclamation", tipo: "os", ref: o.id,
                t: rot + " atrasada", s: o.titulo + " · venceu há " + (-d) + (d === -1 ? " dia" : " dias") + quem });
        } else if (d === 0) {
            lista.push({ key: "h" + o.id, nivel: 3, cor: "lar", ic: "fa-clock", tipo: "os", ref: o.id,
                t: rot + " vence HOJE", s: o.titulo + quem });
        } else if (d <= 2) {
            lista.push({ key: "p" + o.id + "_" + d, nivel: 2, cor: "amar", ic: "fa-hourglass-half", tipo: "os", ref: o.id,
                t: rot + (d === 1 ? " vence amanhã" : " vence em 2 dias"), s: o.titulo + quem });
        }

        // O aviso de "nova OS" não pode depender do prazo: designada hoje para
        // a semana que vem, o técnico precisa saber que existe uma OS para aceitar
        if (!adm && minha && o.origem === "designada" && o.status === "aguardando") {
            lista.push({ key: "n" + o.id, nivel: 2, cor: "azul", ic: "fa-hand-point-right", tipo: "os", ref: o.id,
                t: "Nova OS para você", s: rot + " · " + o.titulo });
        }
    });

    avisos.forEach(function (a) {
        if (a.para !== sessao || a.em < recente) return;
        lista.push({ key: "v" + a.id, nivel: 3, cor: a.cor || "verde", ic: a.ic || "fa-circle-check", tipo: "os", ref: a.osId, t: a.t, s: a.s });
    });

    eventos.forEach(function (e) {
        if (!paraMim(e)) return;
        var d = diasAte(e.data);
        if (d < 0) return;
        var novo = e.criadoEm > recente && e.criadoPor !== sessao;
        if (!novo && d > 2) return;
        var quando = d === 0 ? "hoje" : d === 1 ? "amanhã" : d === 2 ? "em 2 dias" : fmtData(e.data);
        lista.push({ key: "e" + e.id + "_" + e.criadoEm, nivel: d === 0 ? 3 : 2, cor: "roxo", ic: "fa-calendar-check", tipo: "ev", ref: e.id,
            t: (novo ? "Novo evento: " : "Evento: ") + e.titulo,
            s: quando + (e.hora ? " às " + e.hora : "") + " · " + e.tipo });
    });

    // Aniversários e meta da equipe
    aniversariantesDoDia(hoje()).forEach(function (u) {
        var eu = u.id === sessao;
        lista.push({ key: "nv" + u.id + "_" + hoje(), nivel: 3, cor: "rosa", ic: "fa-cake-candles", tipo: "niver", ref: hoje(),
            t: eu ? "🎉 Parabéns, " + u.nome + "!" : "🎂 Hoje é aniversário de " + u.nome,
            s: eu ? "Hoje é o seu dia. A equipe deseja muito sucesso!" : "Não esqueça de dar os parabéns" });
    });
    if (adm) {
        aniversariantesDoDia(somaDias(1)).forEach(function (u) {
            lista.push({ key: "nva" + u.id + "_" + somaDias(1), nivel: 2, cor: "rosa", ic: "fa-cake-candles", tipo: "niver", ref: somaDias(1),
                t: "🎂 Amanhã é aniversário de " + u.nome, s: "Que tal preparar uma surpresa para a equipe?" });
        });
    }
    var mt = metaInfo();
    if (mt.meta && mt.feitas >= mt.meta) {
        lista.push({ key: "mt" + mesAtual() + "_" + mt.meta, nivel: 2, cor: "verde", ic: "fa-bullseye", tipo: "meta", ref: 0,
            t: "🎯 Meta do mês batida!", s: mt.feitas + " de " + mt.meta + " OS finalizadas pela equipe" });
    }

    // Compras
    var comp = adm || ehCompras();
    if (comp) {
        compras.forEach(function (c) {
            if (!compraAtiva(c)) return;
            if (compraAtrasada(c) && c.previsao) {
                lista.push({ key: "ca" + c.id + "_" + c.previsao, nivel: 4, cor: "verm", ic: "fa-truck", tipo: "compra", ref: c.id,
                    t: "Entrega atrasada: " + c.nome, s: "Prevista para " + fmtData(c.previsao) + (c.fornecedor ? " · " + c.fornecedor : "") });
            }
            if (ehCompras() && c.status === "solicitada") {
                lista.push({ key: "cn" + c.id, nivel: c.prior === "hoje" ? 4 : 3, cor: "azul", ic: "fa-cart-shopping", tipo: "compra", ref: c.id,
                    t: (c.prior === "hoje" ? "PARA HOJE: " : c.prior === "urgente" ? "Urgente: " : "") + "Nova solicitação de compra", s: c.nome + " · " + fmtQtd(c.qtd) + " " + c.un + " · pedida por " + nomeDe(c.por) });
            }
            if (adm && c.status === "visualizada" && c.vistaEm) {
                lista.push({ key: "cv" + c.id, nivel: 2, cor: "verde", ic: "fa-eye", tipo: "compra", ref: c.id,
                    t: nomeDe(c.vistaPor) + " visualizou a solicitação", s: c.nome + " · " + fmtTs(c.vistaEm) });
            }
        });
    }
    if (adm) {
        estoque.forEach(function (e) {
            if (compraAberta(e.id)) return;   // já tem solicitação de compra em aberto
            var s = saldoEstoque(e);
            var local = locTexto(e) || e.local || "";
            if (estSaldoZero(e)) {
                lista.push({ key: "ez" + e.id + "_" + s, nivel: 3, cor: "verm", ic: "fa-box-open", tipo: "est", ref: e.id,
                    t: "Estoque zerado: " + e.nome, s: "Sem solicitação de compra em aberto" + (local ? " · " + local : "") });
            } else if (estBaixo(e)) {
                lista.push({ key: "eb" + e.id + "_" + s, nivel: 2, cor: "lar", ic: "fa-arrow-trend-down", tipo: "est", ref: e.id,
                    t: "Abaixo do mínimo: " + e.nome, s: "Saldo " + fmtQtd(s) + " " + e.un + " · mínimo " + fmtQtd(e.min) + (local ? " · " + local : "") });
            }
        });
    }

    // avisos que o usuário apagou (deslizando para o lado) não aparecem mais
    var disp = getDispensados();
    lista = lista.filter(function (a) { return disp.indexOf(a.key) === -1; });

    lista.sort(function (a, b) { return b.nivel - a.nivel; });
    return agruparAlertas(lista);
}

function atualizarSino() {
    if (!user()) return;
    var novos = naoLidos();
    var n = novos.length;
    var b = $("sinoBadge");
    b.textContent = n > 9 ? "9+" : n;
    b.classList.toggle("on", n > 0);
    $("sino").classList.toggle("toca", novos.some(function (a) { return a.nivel >= 3; }));
}

function abrirAlertas() {
    var lista = alertas();
    var lidos = getLidos();
    var h = '<div class="sheet-alca"></div><h2>🔔 Avisos</h2>';

    if ("Notification" in window && Notification.permission === "default") {
        h += '<button class="btn-ativar" onclick="ativarAvisos()"><i class="fa-solid fa-bell"></i> Ativar avisos no celular</button>';
    }

    h += '<div id="notifLista">';
    if (!lista.length) {
        h += '<div class="vazio"><i class="fa-regular fa-circle-check"></i>Tudo em dia! Nenhum aviso no momento.</div>';
    } else {
        h += lista.map(function (a) {
            var acao = a.tipo === "niver" ? "irNiver('" + a.ref + "')" : a.tipo === "meta" ? "fecharOS();ir('inicio')" : a.tipo === "os" ? "abrirOS(" + a.ref + ")" : a.tipo === "compra" ? "abrirCompra(" + a.ref + ",true)" : a.tipo === "est" ? "abrirPeca(" + a.ref + ")" : "irEvento(" + a.ref + ")";
            return '<div class="notif-wrap"><div class="notif-fundo"><i class="fa-solid fa-trash-can"></i></div>' +
                '<div class="notif ' + a.cor + (lidos.indexOf(a.key) === -1 ? " nova" : "") + '" data-keys="' + esc((a.keys || [a.key]).join(",")) + '" onclick="' + acao + '">' +
                '<div class="notif-ic"><i class="fa-solid ' + a.ic + '"></i></div>' +
                '<div class="notif-tx"><b>' + esc(a.t) + '</b><small>' + esc(a.s) + '</small></div></div></div>';
        }).join("");
    }
    h += '</div>';

    h += '<p class="dica">Deslize um aviso para o lado para apagá-lo. Os avisos de pop-up aparecem quando o app está aberto neste aparelho.</p>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");

    marcarLidos();
    atualizarSino();
}

/* Deslizar um aviso para o lado apaga (igual às notificações do celular) */
var notifBloq = false;

(function () {
    var drag = null;
    var el = $("sheet");
    if (!el) return;

    // depois de arrastar, o toque não pode "abrir" o aviso
    document.addEventListener("click", function (e) {
        if (notifBloq) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    function sumir(n, dir) {
        var keys = (n.getAttribute("data-keys") || "").split(",").filter(Boolean);
        dispensarAlertas(keys);
        atualizarSino();
        var wrap = n.parentNode;
        n.style.transition = "transform .22s ease, opacity .22s ease";
        n.style.transform = "translateX(" + (dir * (n.offsetWidth + 40)) + "px)";
        n.style.opacity = "0";
        setTimeout(function () {
            wrap.style.height = wrap.offsetHeight + "px";
            void wrap.offsetHeight;
            wrap.style.transition = "height .2s ease, margin .2s ease";
            wrap.style.height = "0";
            wrap.style.marginBottom = "0";
            setTimeout(function () {
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                var box = $("notifLista");
                if (box && !box.querySelector(".notif-wrap")) {
                    box.innerHTML = '<div class="vazio"><i class="fa-regular fa-circle-check"></i>Tudo em dia! Nenhum aviso no momento.</div>';
                }
            }, 210);
        }, 220);
    }

    el.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        var n = e.target.closest ? e.target.closest(".notif") : null;
        if (!n || !n.getAttribute("data-keys")) return;
        drag = { el: n, x: e.clientX, id: e.pointerId, dx: 0, move: false, t: Date.now() };
        n.style.transition = "none";
    });

    el.addEventListener("pointermove", function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x;
        if (!drag.move) {
            if (Math.abs(dx) < 8) return;
            drag.move = true;
            try { drag.el.setPointerCapture(e.pointerId); } catch (x) {}
        }
        drag.dx = dx;
        drag.el.style.transform = "translateX(" + dx + "px)";
        drag.el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / (drag.el.offsetWidth * 1.1)));
    });

    function soltar(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var d = drag;
        drag = null;
        if (!d.move) { d.el.style.transition = ""; return; }
        notifBloq = true;
        setTimeout(function () { notifBloq = false; }, 80);
        var passou = Math.abs(d.dx) > d.el.offsetWidth * 0.35;
        var rapido = Math.abs(d.dx) > 40 && Math.abs(d.dx) / Math.max(1, Date.now() - d.t) > 0.5;
        if (e.type !== "pointercancel" && (passou || rapido)) {
            sumir(d.el, d.dx > 0 ? 1 : -1);
        } else {
            d.el.style.transition = "transform .2s ease, opacity .2s ease";
            d.el.style.transform = "";
            d.el.style.opacity = "";
            setTimeout(function () { d.el.style.transition = ""; }, 220);
        }
    }
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
})();

function ativarAvisos() {
    try {
        Notification.requestPermission().then(function (p) {
            toast(p === "granted" ? "Avisos ativados ✔" : "Permissão não concedida");
            abrirAlertas();
            if (p === "granted") notificarSistema();
        });
    } catch (e) { toast("Este navegador não suporta avisos"); }
}

function mostrarNotif(t, b) {
    var op = { body: b, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
    // No celular (app instalado) o aviso precisa sair pelo service worker
    try {
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready
                .then(function (r) { return r.showNotification(t, op); })
                .catch(function () { try { new Notification(t, op); } catch (e) {} });
            return;
        }
    } catch (e) {}
    try { new Notification(t, op); } catch (e) {}
}

function notificarSistema() {
    if (!user() || !("Notification" in window) || Notification.permission !== "granted") return;
    var chave = "mc_n_" + sessao + "_" + hoje();
    var feitos = [];
    try { feitos = JSON.parse(localStorage.getItem(chave) || "[]"); } catch (e) {}

    var novos = alertas().filter(function (a) { return feitos.indexOf(a.key) === -1; });
    novos.slice(0, 3).forEach(function (a) { mostrarNotif(a.t, a.s); });
    if (novos.length > 3) mostrarNotif("Você tem mais " + (novos.length - 3) + " avisos", "Abra o app para ver.");

    novos.forEach(function (a) { feitos.push(a.key); });
    try { localStorage.setItem(chave, JSON.stringify(feitos)); } catch (e) {}
}

function irEvento(id) {
    var e = buscarEv(id);
    if (!e) return;
    fecharOS();
    calSel = e.data;
    var d = dataDe(e.data);
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    ir("calendario");
    setTimeout(function () { abrirEvento(id); }, 150);
}

/* ==========================================
   LISTAGEM DE OS
========================================== */
function htmlOS(o) {
    var p = PRIOR[o.prior], s = STAT[o.status];
    var atr = atrasada(o);
    var souEu = o.tecId === sessao;
    var adm = ehAdmin();
    var nFotos = (o.fotos ? o.fotos.antes.length + o.fotos.depois.length : 0);
    var nItens = (o.itens ? o.itens.length : 0);

    var aviso = "";
    if (o.origem === "designada" && o.status === "aguardando") {
        if (souEu) aviso = '<div class="os-aviso"><i class="fa-solid fa-hand-point-right"></i>Aguardando o seu aceite</div>';
        else if (!adm) aviso = '<div class="os-aviso trava"><i class="fa-solid fa-lock"></i>Só ' + esc(nomeDe(o.tecId)) + ' pode aceitar</div>';
    }

    var destaque = (souEu && !adm && o.origem === "designada" && o.status === "aguardando") ? " destaque" : "";

    return '' +
    '<div class="os ' + p.k + destaque + '" onclick="abrirOS(' + o.id + ')">' +
        '<div class="os-topo">' +
            '<span class="os-num">OS ' + num(o.id) + '</span>' +
            '<span>' +
                '<span class="tag-orig ' + (o.origem === "campo" ? "campo" : "") + '">' + (o.origem === "campo" ? "Campo" : "Designada") + '</span> ' +
                '<span class="tag-p ' + p.c + '">' + p.t + '</span>' +
            '</span>' +
        '</div>' +
        '<div class="os-titulo">' + esc(o.titulo) + '</div>' +
        '<div class="os-resp">' + avatarHTML(userPorId(o.tecId), "os-av") +
            '<div class="os-resp-tx"><b>' + esc(nomeDe(o.tecId)) + '</b>' +
            '<small>' + esc(o.setor) + ' · ' + (o.origem === "campo" ? "Registrada" : "Aberta") + ' em ' + fmtData(o.criada) + '</small></div>' +
        '</div>' +
        (o.data ? '<div class="os-info"><span class="' + (atr ? "atraso" : "") + '"><i class="fa-solid fa-calendar"></i>' +
            (o.origem === "campo" ? "Serviço em " : "Prazo ") + fmtData(o.data) + (atr ? " · atrasada" : "") + '</span></div>' : "") +
        aviso +
        '<div class="os-rodape">' +
            '<span class="tag ' + s.c + '">' + s.t + '</span>' +
            (podeCompartilharOS(o)
                ? '<button class="os-pdf" onclick="event.stopPropagation(); pdfOS(' + o.id + ')" aria-label="Compartilhar PDF"><i class="fa-solid fa-file-pdf"></i> PDF</button>'
                : "") +
            ((nFotos || nItens) ? '<span class="os-fotos">' +
                (nFotos ? '<i class="fa-solid fa-camera"></i>' + nFotos : "") +
                (nItens ? '<i class="fa-solid fa-box-open" style="margin-left:' + (nFotos ? 10 : 0) + 'px"></i>' + nItens : "") +
            '</span>' : "") +
        '</div>' +
    '</div>';
}

function listaHTML(arr, vazioMsg) {
    if (!arr.length) return '<div class="vazio"><i class="fa-regular fa-folder-open"></i>' + vazioMsg + '</div>';
    return arr.map(htmlOS).join("");
}

function porId(a, b) { return b.id - a.id; }

/* ----- Início ----- */
function dataLonga(d) {
    return DIAS[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()];
}

// Data e hora em tempo real no topo da tela inicial
function atualizarRelogio() {
    if (viewAtual !== "inicio" || !user()) return;
    var a = $("topoData"), h = $("topoHora");
    if (!a || !h) return;
    var d = new Date(), c = cabecalho("inicio");
    if (a.textContent !== DIAS[d.getDay()]) a.textContent = DIAS[d.getDay()];
    if ($("topoSub").textContent !== c[1]) $("topoSub").textContent = c[1];
    h.innerHTML = d.getDate() + " de " + MESES[d.getMonth()] + ' · <i class="fa-regular fa-clock"></i> ' + d.toLocaleTimeString("pt-BR");
}

function renderInicio() {
    var adm = ehAdmin();
    if ($("festaBox")) $("festaBox").innerHTML = festaHTML();
    if ($("metaBox")) $("metaBox").innerHTML = metaHTML();
    var base = adm ? ordens : ordens.filter(function (o) { return o.tecId === sessao; });

    function cont(st) { return base.filter(function (o) { return o.status === st; }).length; }
    var ag = cont("aguardando"), an = cont("andamento"), fi = cont("final");
    var venceHoje = base.filter(function (o) { return o.status !== "final" && o.data === hoje(); }).length;
    var minhas = adm ? "" : ", true";

    // Faixa de resumo: nada repete os cards de baixo
    if (adm) {
        $("resumo").innerHTML =
            '<div class="res-item azul clic" onclick="filtrarOS(\'todas\')"><b>' + ordens.length + '</b><small>Total de OS</small></div>' +
            '<div class="res-item amarelo clic" onclick="filtrarOS(\'hoje\')"><b>' + venceHoje + '</b><small>Vencem hoje</small></div>' +
            '<div class="res-item vermelho clic" onclick="filtrarOS(\'atrasadas\')"><b>' + ordens.filter(atrasada).length + '</b><small>Atrasadas</small></div>';
    } else {
        $("resumo").innerHTML =
            '<div class="res-item azul clic" onclick="filtrarOS(\'abertas\', true)"><b>' + (ag + an) + '</b><small>Minhas abertas</small></div>' +
            '<div class="res-item amarelo clic" onclick="filtrarOS(\'hoje\', true)"><b>' + venceHoje + '</b><small>Vencem hoje</small></div>' +
            '<div class="res-item verde clic" onclick="filtrarOS(\'final\', true)"><b>' + fi + '</b><small>Concluídas</small></div>';
    }

    $("cards").innerHTML =
        '<div class="card aguardando" onclick="filtrarOS(\'aguardando\'' + minhas + ')"><div class="barra"></div><h3>Não iniciadas</h3><b>' + ag + '</b></div>' +
        '<div class="card andamento" onclick="filtrarOS(\'andamento\'' + minhas + ')"><div class="barra"></div><h3>Em andamento</h3><b>' + an + '</b></div>' +
        '<div class="card final" onclick="filtrarOS(\'final\'' + minhas + ')"><div class="barra"></div><h3>Finalizadas</h3><b>' + fi + '</b></div>';

    // Faixa de avisos
    var al = alertas();
    var nAtr = al.filter(function (a) { return a.nivel === 4 && a.tipo === "os"; }).length;
    var nHoje = al.filter(function (a) { return a.nivel === 3 && a.tipo === "os"; }).length;
    var banner = "";
    if (nAtr || nHoje) {
        var partes = [];
        if (nAtr) partes.push(nAtr + (nAtr === 1 ? " atrasada" : " atrasadas"));
        if (nHoje) partes.push(nHoje + " para hoje");
        banner = '<div class="alerta-banner" onclick="abrirAlertas()"><i class="fa-solid fa-bell"></i>' +
                 '<div><b>Atenção aos prazos!</b><small>' + partes.join(" · ") + ' — toque para ver</small></div>' +
                 '<i class="fa-solid fa-chevron-right"></i></div>';
    }
    $("alertaBanner").innerHTML = banner;
    $("alertaBanner").style.display = banner ? "block" : "none";

    // Bloco de destaque
    var dest = "";
    if (adm) {
        var atr = ordens.filter(atrasada).sort(porId).slice(0, 3);
        if (atr.length) dest = '<h2 class="alerta-titulo" style="margin-bottom:12px"><i class="fa-solid fa-triangle-exclamation"></i> Atrasadas</h2>' + atr.map(htmlOS).join("");
    } else {
        var parAceitar = base.filter(function (o) { return o.status === "aguardando"; }).sort(porId);
        if (parAceitar.length) dest = '<h2 style="margin-bottom:12px">🔔 Aguardando seu aceite</h2>' + parAceitar.map(htmlOS).join("");
    }
    $("blocoDestaque").innerHTML = dest;
    $("blocoDestaque").style.display = dest ? "block" : "none";

    var campo = ordens.filter(function (o) { return o.origem === "campo"; }).sort(porId).slice(0, 3);
    if (adm && campo.length) {
        $("blocoCampo").innerHTML = '<div class="bloco-topo"><h2>📷 Relatórios de campo</h2><a onclick="filtrarOS(\'campo\')">Ver todos</a></div>' + campo.map(htmlOS).join("");
        $("blocoCampo").style.display = "block";
    } else {
        $("blocoCampo").innerHTML = "";
        $("blocoCampo").style.display = "none";
    }

    // Técnico: vê (somente leitura) o que os colegas estão fazendo agora
    var eq = ordens.filter(function (o) { return o.status === "andamento" && o.tecId !== sessao; }).sort(porId).slice(0, 3);
    if (!adm && eq.length) {
        $("blocoEquipe").innerHTML = '<div class="bloco-topo"><h2>🔧 Em andamento na equipe</h2><a onclick="filtrarOS(\'andamento\')">Ver todas</a></div>' + eq.map(htmlOS).join("");
        $("blocoEquipe").style.display = "block";
    } else {
        $("blocoEquipe").innerHTML = "";
        $("blocoEquipe").style.display = "none";
    }

    $("tituloRecentes").textContent = adm ? "Últimas ordens" : "Minhas últimas ordens";
    $("listaRecentes").innerHTML = listaHTML(base.slice().sort(porId).slice(0, 5),
        adm ? "Nenhuma OS ainda. Toque no + para criar." : "Você ainda não tem OS. Toque no + para registrar um serviço.");
}

/* ----- Ordens ----- */
function filtrarOS(f, minhas) {
    filtro = f;
    soMinhas = !!minhas && !ehAdmin();
    $("busca").value = "";
    ir("os");
}

function setFiltro(f) { filtro = f; renderOS(); }
function toggleMinhas() { soMinhas = !soMinhas; renderOS(); }

function passa(o) {
    // "Minhas" desligado: vê também as OS dos colegas (somente leitura)
    if (soMinhas && o.tecId !== sessao) return false;
    if (filtro === "atrasadas") return atrasada(o);
    if (filtro === "hoje") return o.status !== "final" && o.data === hoje();
    if (filtro === "abertas") return o.status !== "final";
    if (filtro === "designada") return o.origem === "designada";
    if (filtro === "campo") return o.origem === "campo";
    if (filtro !== "todas") return o.status === filtro;
    return true;
}

function renderOS() {
    var chips = [
        ["todas", "Todas"], ["aguardando", "Não iniciadas"], ["andamento", "Em andamento"],
        ["final", "Finalizadas"], ["hoje", "Vencem hoje"], ["atrasadas", "Atrasadas"],
        ["designada", "Designadas"], ["campo", "Campo"]
    ];

    var html = "";
    html += '<button class="chip ' + (soMinhas ? "on" : "") + '" onclick="toggleMinhas()"><i class="fa-solid fa-user"></i> ' + (ehAdmin() ? "Só as minhas" : "Minhas") + '</button>';
    html += chips.map(function (c) {
        return '<button class="chip ' + (filtro === c[0] ? "on" : "") + '" onclick="setFiltro(\'' + c[0] + '\')">' + c[1] + '</button>';
    }).join("");
    $("chips").innerHTML = html;

    var q = $("busca").value.trim().toLowerCase();

    var arr = ordens.filter(function (o) {
        if (!passa(o)) return false;
        if (!q) return true;
        var alvo = (o.titulo + " " + nomeDe(o.tecId) + " " + o.setor + " " + num(o.id)).toLowerCase();
        return alvo.indexOf(q) !== -1;
    }).sort(porId);

    $("listaOS").innerHTML = listaHTML(arr, "Nenhuma ordem encontrada.");
}

/* ==========================================
   CALENDÁRIO
========================================== */
function mudaMes(n) {
    calMes.setMonth(calMes.getMonth() + n);
    renderCalendario();
}

function selecionaDia(d) {
    calSel = d;
    renderCalendario();
}

function irHoje() {
    calSel = hoje();
    calMes = new Date();
    calMes.setDate(1);
    renderCalendario();
}

function eventosDoDia(data) {
    return eventos.filter(function (e) { return e.data === data && paraMim(e); })
                  .sort(function (a, b) { return (a.hora || "").localeCompare(b.hora || ""); });
}

function renderCalendario() {
    var ano = calMes.getFullYear(), mes = calMes.getMonth();
    $("calAno").textContent = String(ano);
    $("calMesNome").textContent = MESES[mes];

    var primeiro = new Date(ano, mes, 1).getDay();
    var total = new Date(ano, mes + 1, 0).getDate();
    var h = hoje();
    var html = "";
    var nOS = 0, nEv = 0;

    for (var i = 0; i < primeiro; i++) html += '<div class="dia fora"></div>';

    for (var d = 1; d <= total; d++) {
        var data = iso(new Date(ano, mes, d));
        var os = ordens.filter(function (o) { return o.data === data; });
        var ev = eventosDoDia(data);
        var nv = aniversariantesDoDia(data);
        nOS += os.length;
        nEv += ev.length + nv.length;

        var kinds = [];
        if (os.some(function (o) { return o.status !== "final" && !atrasada(o); })) kinds.push("azul");
        if (os.some(atrasada)) kinds.push("verm");
        if (os.some(function (o) { return o.status === "final"; })) kinds.push("verde");
        if (ev.length) kinds.push("roxo");
        if (nv.length) kinds.push("rosa");

        var fds = new Date(ano, mes, d).getDay();
        var cls = "dia" + (kinds.length ? " tem" : "") + (fds === 0 || fds === 6 ? " fds" : "") +
                  (data === h ? " hoje" : "") + (data === calSel ? " sel" : "");

        html += '<div class="' + cls + '" onclick="selecionaDia(\'' + data + '\')">' + d +
                '<span class="pontos">' + kinds.map(function (k) { return '<i class="' + k + '"></i>'; }).join("") + '</span></div>';
    }

    $("calGrade").innerHTML = html;
    $("calResumo").textContent = nOS + (nOS === 1 ? " OS" : " OS") + " · " + nEv + (nEv === 1 ? " evento" : " eventos") + " no mês";

    // Painel do dia
    var dt = dataDe(calSel);
    $("calDiaTitulo").textContent = (calSel === h ? "Hoje · " : "") + DIAS[dt.getDay()];
    $("calDiaSub").textContent = dt.getDate() + " de " + MESES[dt.getMonth()] + " de " + dt.getFullYear();

    $("calAcoes").innerHTML = ehAdmin()
        ? '<button class="a-evento" onclick="formEvento(null, calSel)"><i class="fa-solid fa-calendar-plus"></i>Novo evento</button>' +
          '<button class="a-os" onclick="novaOS(calSel)"><i class="fa-solid fa-plus"></i>Nova OS</button>'
        : '<button class="a-os" onclick="novaOS(calSel)"><i class="fa-solid fa-camera"></i>Registrar serviço</button>';

    var evs = eventosDoDia(calSel);
    var oss = ordens.filter(function (o) { return o.data === calSel; }).sort(porId);
    var lista = "";

    if (evs.length) {
        lista += '<div class="sec-rot">Eventos</div>' + evs.map(htmlEvento).join("");
    }
    var nvs = aniversariantesDoDia(calSel);
    if (nvs.length) {
        lista += '<div class="sec-rot">Aniversários</div>' + nvs.map(function (u) {
            return '<div class="niver-card">' + avatarHTML(u, "niver-av") + '<div><b>🎂 ' + esc(u.nome) + '</b>' +
                   '<small>' + (u.id === sessao ? "Parabéns pelo seu dia! 🎉" : esc(u.funcao) + " · dê os parabéns!") + '</small></div></div>';
        }).join("");
    }
    if (oss.length) {
        lista += '<div class="sec-rot">Ordens de serviço</div>' + oss.map(htmlOS).join("");
    }
    if (!lista) lista = '<div class="vazio"><i class="fa-regular fa-calendar"></i>Nada marcado para este dia.</div>';
    $("calLista").innerHTML = lista;
}

function htmlEvento(e) {
    var para = e.para === "todos" ? "Todos os técnicos" : nomeDe(e.para);
    return '<div class="evento" onclick="abrirEvento(' + e.id + ')">' +
        '<div class="ev-topo"><span class="ev-hora"><i class="fa-regular fa-clock"></i> ' + esc(e.hora || "Dia todo") + '</span>' +
        '<span class="ev-tipo">' + esc(e.tipo) + '</span></div>' +
        '<div class="ev-tit">' + esc(e.titulo) + '</div>' +
        '<div class="ev-info"><i class="fa-solid fa-user-group"></i>' + esc(para) + '</div></div>';
}

function abrirEvento(id) {
    var e = buscarEv(id);
    if (!e) return;
    var para = e.para === "todos" ? "Todos os técnicos" : nomeDe(e.para);

    var h = '<div class="sheet-alca"></div>' +
        '<div class="linha-tags"><span class="ev-hora"><i class="fa-regular fa-clock"></i> ' + esc(e.hora || "Dia todo") + '</span>' +
        '<span class="ev-tipo">' + esc(e.tipo) + '</span></div>' +
        '<h2>' + esc(e.titulo) + '</h2>' +
        '<div class="grade-info">' +
            '<div><small>Data</small><b>' + fmtData(e.data) + '</b></div>' +
            '<div><small>Para</small><b>' + esc(para) + '</b></div>' +
            '<div><small>Criado por</small><b>' + esc(nomeDe(e.criadoPor)) + '</b></div>' +
        '</div>' +
        '<h4>Detalhes</h4><div class="sheet-desc">' + (esc(e.desc) || "Sem detalhes.") + '</div>';

    if (ehAdmin()) {
        h += '<div class="sheet-acoes">' +
             '<button class="btn-sec" onclick="formEvento(' + e.id + ')"><i class="fa-solid fa-pen"></i> Editar</button>' +
             '<button class="btn-perigo" onclick="excluirEvento(' + e.id + ')"><i class="fa-solid fa-trash"></i> Excluir</button></div>';
    }

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

function formEvento(id, dataIni) {
    var e = id ? buscarEv(id) : null;
    var data = e ? e.data : (dataIni || calSel);

    var optsTipo = TIPOS_EVENTO.map(function (t) {
        return '<option' + (e && e.tipo === t ? " selected" : "") + '>' + t + "</option>";
    }).join("");

    var optsPara = '<option value="todos"' + (!e || e.para === "todos" ? " selected" : "") + '>Todos os técnicos</option>' +
        tecnicos().map(function (u) {
            return '<option value="' + u.id + '"' + (e && e.para === u.id ? " selected" : "") + '>' + esc(u.nome) + "</option>";
        }).join("");

    var h = '<div class="sheet-alca"></div>' +
        '<h2>' + (e ? "Editar evento" : "Novo evento") + '</h2>' +
        '<label class="campo" id="cEvTit"><span>Título *</span><input type="text" id="evTitulo" maxlength="80" placeholder="Ex: Manutenção preventiva da Linha 1" value="' + esc(e ? e.titulo : "") + '"><em class="erro">Informe o título do evento.</em></label>' +
        '<div class="linha2">' +
            '<label class="campo"><span>Data</span><input type="date" id="evData" value="' + data + '"></label>' +
            '<label class="campo"><span>Hora</span><input type="time" id="evHora" value="' + esc(e ? e.hora : "08:00") + '"></label>' +
        '</div>' +
        '<div class="linha2">' +
            '<label class="campo"><span>Tipo</span><select id="evTipo">' + optsTipo + '</select></label>' +
            '<label class="campo"><span>Avisar</span><select id="evPara">' + optsPara + '</select></label>' +
        '</div>' +
        '<label class="campo"><span>Detalhes</span><textarea id="evDesc" rows="3" maxlength="400" placeholder="Local, orientações, materiais...">' + esc(e ? e.desc : "") + '</textarea></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="salvarEvento(' + (e ? e.id : "null") + ')"><i class="fa-solid fa-check"></i> Salvar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

function salvarEvento(id) {
    var titulo = $("evTitulo").value.trim();
    var data = $("evData").value;
    if (!titulo) { $("cEvTit").classList.add("invalido"); return; }
    if (!data) { toast("Escolha a data do evento"); return; }

    var paraVal = $("evPara").value;
    var dados = {
        titulo: titulo,
        data: data,
        hora: $("evHora").value,
        tipo: $("evTipo").value,
        para: paraVal === "todos" ? "todos" : Number(paraVal),
        desc: $("evDesc").value.trim()
    };

    if (id) {
        var e = buscarEv(id);
        for (var k in dados) e[k] = dados[k];
        e.criadoEm = Date.now();   // reaparece como "novo" nos avisos
    } else {
        dados.id = proximoId(eventos);
        dados.criadoPor = sessao;
        dados.criadoEm = Date.now();
        eventos.push(dados);
    }

    salvar();
    fecharOS();
    calSel = data;
    var d = dataDe(data);
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    renderTudo();
    toast("Evento salvo ✔");
}

/* Janela de confirmação (substitui o confirm() feio do navegador).
   o: { ic, titulo, texto (html já escapado), sim, nao, tipo: "perigo" | "azul" } */
function fecharDlg() {
    var d = $("dlgConf");
    if (d && d.parentNode) d.parentNode.removeChild(d);
}

function pedirConfirmacao(o, ok) {
    fecharDlg();
    var d = document.createElement("div");
    d.id = "dlgConf";
    d.className = "dlg-fundo";
    d.innerHTML = '<div class="dlg ' + (o.tipo || "perigo") + '" role="alertdialog" aria-modal="true">' +
        '<div class="dlg-ic"><i class="fa-solid ' + (o.ic || "fa-trash-can") + '"></i></div>' +
        '<h3>' + esc(o.titulo) + '</h3>' +
        '<p>' + o.texto + '</p>' +
        '<div class="dlg-bt">' +
            '<button type="button" class="dlg-nao">' + esc(o.nao || "Não, manter") + '</button>' +
            '<button type="button" class="dlg-sim"><i class="fa-solid ' + (o.ic || "fa-trash-can") + '"></i> ' + esc(o.sim || "Sim, excluir") + '</button>' +
        '</div></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d) fecharDlg(); });
    d.querySelector(".dlg-nao").onclick = fecharDlg;
    d.querySelector(".dlg-sim").onclick = function () { fecharDlg(); ok(); };
    requestAnimationFrame(function () { d.classList.add("on"); });
    d.querySelector(".dlg-nao").focus();
}

function excluirEvento(id) {
    var ev = eventos.filter(function (e) { return e.id === Number(id); })[0];
    pedirConfirmacao({
        ic: "fa-calendar-xmark", titulo: "Excluir evento?",
        texto: (ev ? 'O evento <b>' + esc(ev.titulo) + '</b> será removido do calendário.' : 'Este evento será removido do calendário.') + ' Essa ação não pode ser desfeita.'
    }, function () {
        eventos = eventos.filter(function (e) { return e.id !== Number(id); });
        salvar();
        fecharOS();
        renderTudo();
        toast("Evento excluído");
    });
}

/* ==========================================
   PERFIL
========================================== */
function renderMenuPerfil() {
    var eq = usuarios.filter(function (u) { return u.id !== sessao; }).length;
    $("mcEquipe").textContent = eq + (eq === 1 ? " pessoa na equipe" : " pessoas na equipe");
    $("mcEmpresa").textContent = empresa.nome || "Logo e nome da empresa";
    $("mcSetores").textContent = setores.length + (setores.length === 1 ? " setor" : " setores");
    var baixos = estoque.filter(estBaixo).length, zer = estoque.filter(estSaldoZero).length, em = $("mcEstoque");
    em.textContent = estoque.length + (estoque.length === 1 ? " material" : " materiais") +
        (baixos ? " · " + baixos + " abaixo do mínimo" : "") + (zer ? " · " + zer + (zer === 1 ? " zerado" : " zerados") : "");
    em.classList.toggle("alerta", baixos + zer > 0);
    atualizarMenuCompras();
}

function renderSub() {
    if (viewAtual === "p-compras") { renderCompras(); return; }
    if (viewAtual === "p-peca")    { renderPeca(); return; }
    // O estoque é de leitura para todos (o técnico precisa pesquisar peças e
    // locais). Antes, esta função parava em `if (!ehAdmin()) return;` e o técnico
    // abria a tela de Estoque vazia, achando que o líder não havia cadastrado nada.
    if (viewAtual === "p-estoque") { renderEstoque(); return; }
    if (!ehAdmin()) return;
    if (viewAtual === "p-equipe")  renderEquipe();
    if (viewAtual === "p-empresa") renderEmpresa();
    if (viewAtual === "p-setores") renderSetoresPerfil();
}

function renderPerfil() {
    var u = user(), adm = ehAdmin();
    setAvatar($("perfilAvatar"), u);
    $("perfilNome").textContent = u.nome;
    $("perfilCargo").textContent = u.funcao;
    $("perfilTel").textContent = u.tel ? "📞 " + u.tel : "";
    renderRanking();
    renderConqCard();

    // Cada número é um atalho para a lista correspondente
    function st(n, rot, acao, ic) {
        return '<div class="clic" onclick="' + acao + '"><i class="fa-solid ' + ic + '"></i><b>' + n + '</b><small>' + rot + '</small></div>';
    }

    if (adm) {
        $("perfilStats").innerHTML =
            st(ordens.filter(function (o) { return o.origem === "designada"; }).length, "OS designadas", "filtrarOS('designada')", "fa-clipboard-list") +
            st(ordens.filter(function (o) { return o.origem === "campo"; }).length, "Relat. de campo", "filtrarOS('campo')", "fa-camera") +
            st(tecnicos().length, "Técnicos", "ir('p-equipe')", "fa-users");
        renderMenuPerfil();
        if ($("zeroInfo")) $("zeroInfo").textContent = empresa && empresa.zeroEm ? "Último recomeço: " + fmtData(empresa.zeroEm) : "";
    } else if (ehCompras()) {
        var r = resumoCompras();
        $("perfilStats").innerHTML =
            st(r.abertas, "Em aberto", "ir('p-compras')", "fa-cart-shopping") + st(r.aguardando, "A comprar", "ir('p-compras')", "fa-clipboard-list") + st(r.caminho, "A caminho", "ir('p-compras')", "fa-truck") + st(r.atrasadas, "Atrasadas", "ir('p-compras')", "fa-triangle-exclamation");
        atualizarMenuCompras();
    } else {
        var m = ordens.filter(function (o) { return o.tecId === sessao; });
        $("perfilStats").innerHTML =
            st(m.length, "Minhas OS", "filtrarOS('todas', true)", "fa-clipboard-list") +
            st(m.filter(function (o) { return o.status === "final"; }).length, "Concluídas", "filtrarOS('final', true)", "fa-circle-check") +
            st(m.filter(atrasada).length, "Atrasadas", "filtrarOS('atrasadas', true)", "fa-triangle-exclamation");
        // O técnico também precisa ver quantos materiais existem no estoque
        if ($("mcEstoque")) {
            var baixos = estoque.filter(estBaixo).length, zer = estoque.filter(estSaldoZero).length;
            $("mcEstoque").textContent = estoque.length
                ? estoque.length + (estoque.length === 1 ? " material" : " materiais") +
                  (baixos ? " · " + baixos + " abaixo do mínimo" : "") +
                  (zer ? " · " + zer + (zer === 1 ? " zerado" : " zerados") : "")
                : "Consulte peças, saldos e onde encontrar";
            $("mcEstoque").classList.toggle("alerta", baixos + zer > 0);
        }
    }
}

/* ----- Editor de perfil (próprio ou, para o líder, de um técnico) ----- */
function abrirEditor(id) {
    var u = userPorId(id);
    if (!u) return;
    if (!ehAdmin() && id !== sessao) return;
    edId = id;
    edFoto = u.foto || "";

    var h = '<div class="sheet-alca"></div>' +
        '<h2>' + (id === sessao ? "Editar meu perfil" : "Editar membro da equipe") + '</h2>' +
        '<div class="ed-foto">' +
            '<div class="ed-av" id="edAv"></div>' +
            '<div class="ed-foto-btns">' +
                '<button type="button" onclick="pickAvatar()"><i class="fa-solid fa-camera"></i>Alterar foto</button>' +
                '<button type="button" class="rm" onclick="removerAvatar()"><i class="fa-solid fa-trash"></i>Remover</button>' +
            '</div>' +
        '</div>' +
        '<label class="campo" id="cEdNome"><span>Nome *</span><input type="text" id="edNome" maxlength="30" value="' + esc(u.nome) + '"><em class="erro">Informe o nome.</em></label>' +
        '<label class="campo"><span>Função</span><input type="text" id="edFuncao" maxlength="40" placeholder="Ex: Eletricista" value="' + esc(u.funcao) + '"></label>' +
        '<label class="campo"><span>Telefone</span><input type="tel" id="edTel" maxlength="20" placeholder="(11) 99999-9999" value="' + esc(u.tel) + '"></label>' +
        '<label class="campo"><span>Data de nascimento <small class="opc">(opcional · a equipe é avisada no aniversário)</small></span><input type="date" id="edNasc" value="' + esc(u.nasc || "") + '"></label>' +
        '<label class="campo"><span>Nova senha (4 números) — opcional</span><input type="password" id="edPin" inputmode="numeric" maxlength="4" placeholder="••••"></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="salvarEditor()"><i class="fa-solid fa-check"></i> Salvar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    atualizarEdAv();
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

/* ----- Empresa (logo e nome) ----- */
function renderEmpresa() {
    var el = $("empLogoPrev");
    el.classList.toggle("tem-logo", !!empresa.logo);
    el.innerHTML = empresa.logo ? '<img src="' + empresa.logo + '" alt="Logo">' : '<i class="fa-solid fa-image"></i>';
    $("empNome").value = empresa.nome;
}

function pickLogo() {
    $("fileLogo").value = "";
    $("fileLogo").click();
}

// Reduz a logo mantendo proporção e transparência (PNG)
function prepararLogo(file, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var max = 360;
            var k = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            cb(c.toDataURL("image/png"));
        };
        img.onerror = function () { toast("Imagem inválida"); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function aoEscolherLogo() {
    var f = $("fileLogo").files[0];
    if (!f || !ehAdmin()) return;
    prepararLogo(f, function (url) {
        empresa.logo = url;
        salvar();
        aplicarMarca();
        renderEmpresa();
        toast("Logo atualizada ✔");
    });
}

function removerLogo() {
    if (!ehAdmin() || !empresa.logo) return;
    empresa.logo = "";
    salvar();
    aplicarMarca();
    renderEmpresa();
    toast("Logo removida");
}

function salvarEmpresa() {
    if (!ehAdmin()) return;
    empresa.nome = $("empNome").value.trim();
    salvar();
    aplicarMarca();
    toast("Empresa salva ✔");
}

function atualizarEdAv() {
    setAvatar($("edAv"), { nome: $("edNome") ? $("edNome").value : "?", foto: edFoto });
}

function pickAvatar() {
    $("fileAvatar").value = "";
    $("fileAvatar").click();
}

function removerAvatar() {
    edFoto = "";
    atualizarEdAv();
}

function recortarQuadrado(file, lado, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var m = Math.min(img.width, img.height);
            var sx = (img.width - m) / 2, sy = (img.height - m) / 2;
            var c = document.createElement("canvas");
            c.width = lado; c.height = lado;
            c.getContext("2d").drawImage(img, sx, sy, m, m, 0, 0, lado, lado);
            cb(c.toDataURL("image/jpeg", 0.82));
        };        img.onerror = function () { toast("Imagem inválida"); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function aoEscolherAvatar() {
    var f = $("fileAvatar").files[0];
    if (!f) return;
    recortarQuadrado(f, 260, function (url) {
        edFoto = url;
        atualizarEdAv();
    });
}

function salvarEditor() {
    var u = userPorId(edId);
    if (!u) return;
    var nome = $("edNome").value.trim();
    var pin = $("edPin").value.trim();
    if (!nome) { $("cEdNome").classList.add("invalido"); return; }
    if (pin && !/^\d{4}$/.test(pin)) { toast("A senha deve ter 4 números"); return; }

    u.nome = nome;
    u.funcao = $("edFuncao").value.trim() || (u.papel === "admin" ? "Líder de Manutenção" : (u.papel === "compras" ? "Compras" : "Técnico de Manutenção"));
    u.tel = $("edTel").value.trim();
    u.nasc = $("edNasc").value || "";
    u.foto = edFoto;
    if (pin) u.pin = pin;

    salvar();
    fecharOS();
    ir(viewAtual);
    toast("Perfil salvo ✔");
}

/* ----- Equipe (líder) ----- */
function renderEquipe() {
    var t = usuarios.filter(function (u) { return u.id !== sessao; });
    $("listaEquipe").innerHTML = t.length ? t.map(function (u) {
        return '<div class="membro" onclick="abrirEditor(' + u.id + ')">' + avatarHTML(u, "av") +
               '<div class="info"><b>' + esc(u.nome) + '</b><small>' + esc(u.funcao) + (u.papel === "compras" ? ' · acesso Compras' : (u.papel === "admin" ? ' · Líder' : '')) + '</small></div>' +
               '<button class="ed" onclick="event.stopPropagation();abrirEditor(' + u.id + ')" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>' +
               '<button onclick="event.stopPropagation();removerTecnico(' + u.id + ')" aria-label="Remover"><i class="fa-solid fa-trash"></i></button></div>';
    }).join("") : '<div class="vazio">Ninguém cadastrado na equipe.</div>';
}

function addTecnico() {
    var nome = $("eqNome").value.trim();
    var pin = $("eqPin").value.trim();
    var papelSel = $("eqPapel").value;
    var papel = papelSel === "compras" ? "compras" : (papelSel === "admin" ? "admin" : "tecnico");
    if (!nome) { toast("Informe o nome"); return; }
    if (!/^\d{4}$/.test(pin)) { toast("A senha deve ter 4 números"); return; }
    usuarios.push({
        id: proximoId(usuarios), nome: nome, papel: papel, pin: pin,
        funcao: $("eqFuncao").value.trim() || (papel === "compras" ? "Compras" : (papel === "admin" ? "Líder de Manutenção" : "Técnico de Manutenção")), tel: "", foto: ""
    });
    salvar();
    $("eqNome").value = "";
    $("eqPin").value = "";
    $("eqFuncao").value = "";
    $("eqPapel").value = "tecnico";
    renderTudo();
    toast("Adicionado à equipe ✔ (toque nele para colocar a foto)");
}

function removerTecnico(id) {
    if (id === sessao) { toast("Você não pode remover o seu próprio acesso"); return; }
    var abertas = ordens.filter(function (o) { return o.tecId === id && o.status !== "final"; }).length;
    if (abertas) { toast("Reatribua as " + abertas + " OS abertas dele antes de remover"); return; }
    pedirConfirmacao({
        ic: "fa-user-minus", titulo: "Remover da equipe?", sim: "Sim, remover",
        texto: '<b>' + esc(nomeDe(id)) + '</b> perderá o acesso ao aplicativo. Essa ação não pode ser desfeita.'
    }, function () {
        usuarios = usuarios.filter(function (u) { return u.id !== id; });
        salvar();
        renderTudo();
        toast("Técnico removido");
    });
}

/* ----- Setores ----- */
function renderSetoresPerfil() {
    $("listaSetores").innerHTML = setores.map(function (s, i) {
        return '<span class="setor-chip">' + esc(s) + '<button onclick="removerSetor(' + i + ')" aria-label="Remover">✕</button></span>';
    }).join("");
}

function adicionarSetor(nome) {
    nome = (nome || "").trim();
    if (!nome) { toast("Digite o nome do setor"); return null; }
    var existe = setores.filter(function (s) { return s.toLowerCase() === nome.toLowerCase(); })[0];
    if (existe) { toast("Esse setor já existe"); return existe; }
    setores.push(nome);
    salvar();
    return nome;
}

function addSetorPerfil() {
    var r = adicionarSetor($("setNovo").value);
    if (r) {
        $("setNovo").value = "";
        renderSetoresPerfil();
        montarSelects();
        toast("Setor adicionado ✔");
    }
}

function removerSetor(i) {
    var nome = setores[i];
    var uso = ordens.filter(function (o) { return o.setor === nome; }).length;
    if (uso) { toast("'" + nome + "' está em uso por " + uso + " OS"); return; }
    if (setores.length <= 1) { toast("Mantenha ao menos um setor"); return; }
    pedirConfirmacao({
        ic: "fa-location-dot", titulo: "Remover setor?", sim: "Sim, remover",
        texto: 'O setor <b>' + esc(nome) + '</b> será removido da lista.'
    }, function () {
        var j = setores.indexOf(nome);
        if (j === -1) return;
        setores.splice(j, 1);
        salvar();
        renderSetoresPerfil();
        montarSelects();
    });
}

function exportar() {
    try {
        var blob = new Blob([JSON.stringify({ usuarios: usuarios, ordens: ordens, setores: setores, eventos: eventos, avisos: avisos, empresa: empresa, estoque: estoque, compras: compras })], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "backup-manutencao-" + hoje() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast("Backup gerado");
    } catch (e) {
        toast("Não foi possível exportar aqui");
    }
}

function limparTudo() {
    pedirConfirmacao({
        ic: "fa-triangle-exclamation", titulo: "Apagar todas as OS?", sim: "Sim, apagar tudo",
        texto: '<b>Todas</b> as ordens de serviço serão apagadas, junto com as fotos. Essa ação não pode ser desfeita.'
    }, function () {
        ordens = [];
        salvar();
        renderTudo();
        toast("Todas as OS foram apagadas");
    });
}

/* Zerar conquistas e ranking de todos (recomeço geral).
   Não apaga nenhuma OS: elas só deixam de valer para pontos, ranking e conquistas. */
function zerarConquistas() {
    if (!ehAdmin()) return;
    pedirConfirmacao({
        ic: "fa-rotate-left", titulo: "Zerar conquistas e ranking?", sim: "Sim, continuar",
        texto: 'Vai zerar <b>as conquistas, o nível, os pontos e o ranking (semanal e mensal)</b> de <b>todos os técnicos</b>. ' +
               'As ordens de serviço continuam salvas. Essa ação não pode ser desfeita.'
    }, function () {
        pedirConfirmacao({
            ic: "fa-triangle-exclamation", titulo: "Tem certeza?", sim: "Zerar tudo agora", nao: "Cancelar",
            texto: 'Todos os técnicos <b>começam do zero</b>. Se quiser guardar o histórico antes, exporte um backup em Dados e backup.'
        }, function () {
            ordens.forEach(function (o) { if (o.status === "final") o.zerada = true; });
            empresa.zeroEm = hoje();
            empresa.zeroTs = Date.now();
            usuarios.forEach(function (u) {
                if (u.papel !== "tecnico") return;
                u.conq = {};
                u.conqV = CONQ_VERSAO;
                // o que não dá para zerar (ex.: foto e nascimento no perfil) entra sem festa
                conqGanhas(statsTec(u.id)).forEach(function (c) { u.conq[c.id] = hoje(); });
            });
            conqFila = [];
            salvar();
            renderTudo();
            toast("Conquistas e ranking zerados ✔");
        });
    });
}

/* ==========================================
   FOTOS DAS OS
========================================== */
function comprimir(file, cb) {
    var r = new FileReader();
    r.onload = function () {
        var img = new Image();
        img.onload = function () {
            var max = 1000;
            var s = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            cb(c.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = function () { toast("Imagem inválida"); cb(null); };
        img.src = r.result;
    };
    r.readAsDataURL(file);
}

function pickFoto(alvo, tipo) {
    pickCtx = { alvo: alvo, tipo: tipo };
    $("fileFoto").value = "";
    $("fileFoto").click();
}

function listaFotos(alvo, tipo) {
    if (alvo === "form") return formFotos[tipo];
    var o = buscar(alvo);
    return o ? o.fotos[tipo] : null;
}

function aoEscolherFotos() {
    var files = Array.prototype.slice.call($("fileFoto").files);
    if (!files.length || !pickCtx) return;
    var ctx = pickCtx, n = files.length;

    files.forEach(function (f) {
        comprimir(f, function (url) {
            var arr = listaFotos(ctx.alvo, ctx.tipo);
            if (url && arr) {
                if (arr.length >= MAX_FOTOS) toast("Máximo de " + MAX_FOTOS + " fotos por etapa");
                else arr.push(url);
            }
            n--;
            if (n === 0) fotosAtualizadas(ctx.alvo);
        });
    });
}

function fotosAtualizadas(alvo) {
    if (alvo === "form") { renderFormFotos(); return; }
    salvar();
    abrirOS(alvo);
    renderTudo();
}

function rmFoto(alvo, tipo, i) {
    var arr = listaFotos(alvo, tipo);
    if (!arr) return;
    arr.splice(i, 1);
    fotosAtualizadas(alvo);
}

function verFoto(src) {
    $("viewerImg").src = src;
    $("viewer").classList.add("on");
}

function fecharFoto() {
    $("viewer").classList.remove("on");
    $("viewerImg").src = "";
}

function grupoFotos(alvo, tipo, arr, pode) {
    return '<div class="fotos">' + fotosInner(alvo, tipo, arr, pode) + "</div>";
}

function fotosInner(alvo, tipo, arr, pode) {
    var h = "";
    arr.forEach(function (f, i) {
        h += '<div class="foto"><img src="' + f + '" onclick="verFoto(this.src)" alt="Foto">' +
             (pode ? '<button type="button" class="foto-x" onclick="rmFoto(\'' + alvo + '\',\'' + tipo + '\',' + i + ')">✕</button>' : "") +
             '</div>';
    });
    if (pode && arr.length < MAX_FOTOS) {
        h += '<button type="button" class="foto-add" onclick="pickFoto(\'' + alvo + '\',\'' + tipo + '\')"><i class="fa-solid fa-camera"></i>Adicionar</button>';
    }
    if (!arr.length && !pode) h += '<span class="sem-foto">Sem fotos</span>';
    return h;
}

function renderFormFotos() {
    $("fotosAntesForm").innerHTML = fotosInner("form", "antes", formFotos.antes, true);
    $("fotosDepoisForm").innerHTML = fotosInner("form", "depois", formFotos.depois, true);
}

/* ==========================================
   FORMULÁRIO DE OS
========================================== */
function montarSelects() {
    var vSetor = $("fSetor").value;
    $("fSetor").innerHTML = setores.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") +
        '<option value="__novo__">➕ Novo setor...</option>';
    if (vSetor && setores.indexOf(vSetor) !== -1) $("fSetor").value = vSetor;

    $("fTipo").innerHTML = TIPOS.map(function (s) { return "<option>" + s + "</option>"; }).join("");
    montarDatalist();
}

function aoMudarSetor() {
    var box = $("novoSetorBox");
    if ($("fSetor").value === "__novo__") {
        box.style.display = "flex";
        $("novoSetorInput").value = "";
        $("novoSetorInput").focus();
    } else {
        box.style.display = "none";
    }
}

function criarSetor() {
    var r = adicionarSetor($("novoSetorInput").value);
    if (!r) return;
    montarSelects();
    $("fSetor").value = r;
    $("novoSetorBox").style.display = "none";
    toast("Setor '" + r + "' criado ✔");
}

var modoDesig = false;   // técnico criando uma OS para outro técnico

function setModoDesig(on) {
    modoDesig = !!on && !ehAdmin();
    document.body.classList.toggle("modo-desig", modoDesig);
    document.querySelectorAll("#segModo button").forEach(function (b) {
        b.classList.toggle("on", (b.getAttribute("data-m") === "des") === modoDesig);
    });
    if (modoDesig && $("fData").value === hoje()) $("fData").value = somaDias(1);
    if (!modoDesig && $("fData").value === somaDias(1)) $("fData").value = hoje();
    montarTecSelect($("fTec").value);
    rotulosForm();
    if (viewAtual === "nova") {
        var c = cabecalho("nova");
        $("topoTitulo").textContent = c[0];
        $("topoSub").textContent = c[1];
    }
}

function montarTecSelect(valor) {
    $("fTec").innerHTML = '<option value="">Selecione o técnico</option>' +
        tecnicos().filter(function (u) { return ehAdmin() || u.id !== sessao; }).map(function (u) {
            return '<option value="' + u.id + '">' + esc(u.nome) + " — " + esc(u.funcao) + "</option>";
        }).join("");
    $("fTec").value = valor ? String(valor) : "";
}

function setPrior(p) {
    $("fPrior").value = p;
    document.querySelectorAll("#segPrior button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-p") === p);
    });
}

function rotulosForm() {
    var adm = ehAdmin() || modoDesig, ed = $("fId").value;
    $("lblData").textContent = adm ? "Data prevista" : "Data do serviço";
    var oEd = ed ? buscar(ed) : null;
    var relDes = !!oEd && !adm && oEd.origem === "designada";
    $("lblDesc").textContent = adm ? "Descrição do serviço a executar" : (relDes ? "Relatório do serviço (opcional)" : "Serviço realizado *");
    $("fDesc").placeholder = adm ? "Descreva o defeito e o que deve ser feito..." : (relDes ? "O que foi feito, peças trocadas..." : "Descreva o que foi feito em campo...");
    $("btnSalvar").innerHTML = '<i class="fa-solid fa-check"></i> ' +
        (ed ? "Salvar alterações" : (adm ? "Criar e designar OS" : "Registrar serviço"));
}

function limparErros() {
    ["cTitulo", "cTec", "cDesc"].forEach(function (id) { $(id).classList.remove("invalido"); });
    $("novoSetorBox").style.display = "none";
}

function novaOS(d) {
    $("formOS").reset();
    $("fId").value = "";
    limparErros();
    montarSelects();
    $("cModo").style.display = "";
    $("fTitulo").readOnly = false;
    $("fData").closest("label").style.display = "";
    modoDesig = false;
    document.body.classList.remove("modo-desig");
    document.querySelectorAll("#segModo button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-m") === "reg"); });
    montarTecSelect("");
    $("fData").value = typeof d === "string" ? d : (ehAdmin() ? somaDias(1) : hoje());
    setPrior("media");
    formFotos = { antes: [], depois: [] };
    formItens = [];
    formAssin = "";
    renderFormFotos();
    renderFormItens();
    rotulosForm();
    ir("nova");
    sigIniciar("sigForm", "", function (v) { formAssin = v; });
}

function podeEditar(o) {
    if (ehAdmin()) return o.origem === "designada";
    if (o.tecId !== sessao) return false;
    // técnico edita o próprio relatório de campo e também a OS designada que já finalizou
    return o.origem === "campo" || (o.origem === "designada" && o.status === "final");
}

function editarOS(id) {
    var o = buscar(id);
    if (!o || !podeEditar(o)) return;
    fecharOS();
    $("formOS").reset();
    limparErros();
    montarSelects();
    $("cModo").style.display = "none";
    modoDesig = false;
    document.body.classList.remove("modo-desig");
    $("fId").value = o.id;
    $("fTitulo").value = o.titulo;
    $("fSetor").value = o.setor;
    $("fTipo").value = o.tipo;
    $("fData").value = o.data || "";
    var relDes = !ehAdmin() && o.origem === "designada";   // técnico editando OS designada: mexe no relatório, fotos e materiais
    $("fDesc").value = relDes ? (o.rel || "") : (o.desc || "");
    $("fTitulo").readOnly = relDes;
    $("fData").closest("label").style.display = relDes ? "none" : "";
    montarTecSelect(o.tecId);
    setPrior(o.prior);
    formFotos = { antes: o.fotos.antes.slice(), depois: o.fotos.depois.slice() };
    formItens = (o.itens || []).map(function (i) { return JSON.parse(JSON.stringify(i)); });
    formAssin = o.assinatura || "";
    renderFormFotos();
    renderFormItens();
    rotulosForm();
    ir("nova");
    sigIniciar("sigForm", formAssin, function (v) { formAssin = v; });
}

function salvarOS(ev) {
    ev.preventDefault();
    var adm = ehAdmin() || modoDesig;   // técnico designando também usa o fluxo do líder
    var oEd0 = $("fId").value ? buscar($("fId").value) : null;
    var relDes = !!oEd0 && !adm && oEd0.origem === "designada";   // técnico editando OS designada
    var ok = true;
    limparErros();

    if (!adm && itemPendente("form")) {
        if (!addItem("form")) return;   // item escolhido/digitado e ainda não adicionado
    }

    var titulo = $("fTitulo").value.trim();
    if (!titulo) { $("cTitulo").classList.add("invalido"); ok = false; }

    if ($("fSetor").value === "__novo__") { toast("Digite e adicione o novo setor"); $("novoSetorBox").style.display = "flex"; return; }

    if (adm && !$("fTec").value) { $("cTec").classList.add("invalido"); ok = false; }

    if (!adm && !relDes) {
        if (!$("fDesc").value.trim()) { $("cDesc").classList.add("invalido"); ok = false; }
    }

    if (!ok) { toast("Preencha os campos obrigatórios"); return; }

    var id = $("fId").value;
    var base = {
        titulo: titulo,
        setor: $("fSetor").value,
        tipo: $("fTipo").value,
        data: $("fData").value,
        desc: $("fDesc").value.trim()
    };

    if (id) {
        var o = buscar(id);
        if (!relDes) for (var k in base) o[k] = base[k];
        if (relDes) {
            o.setor = base.setor;
            o.tipo = base.tipo;
            o.rel = base.desc;
            o.fotos = { antes: formFotos.antes.slice(), depois: formFotos.depois.slice() };
            o.itens = formItens.slice();
            if (formAssin) o.assinatura = formAssin; else delete o.assinatura;
        } else if (adm) {
            var novoTec = Number($("fTec").value);
            o.prior = $("fPrior").value;
            if (novoTec !== o.tecId) {
                o.tecId = novoTec;
                if (o.status !== "final") { o.status = "aguardando"; o.aceitaEm = ""; }
            }
        } else {
            o.fotos = { antes: formFotos.antes.slice(), depois: formFotos.depois.slice() };
            o.itens = formItens.slice();
            o.concluida = base.data || hoje();
            if (formAssin) o.assinatura = formAssin; else delete o.assinatura;
        }
        toast("OS " + num(o.id) + " atualizada ✔");
    } else {
        var nova = base;
        nova.id = proximoId(ordens);
        nova.criada = hoje();
        nova.criadaPor = sessao;
        if (adm) {
            nova.origem = "designada";
            nova.tecId = Number($("fTec").value);
            nova.prior = $("fPrior").value;
            nova.status = "aguardando";
            nova.fotos = { antes: [], depois: [] };
            nova.itens = [];
            if (modoDesig) {   // técnico designou: avisa o(s) líder(es)
                usuarios.filter(function (u) { return u.papel === "admin"; }).forEach(function (l) {
                    avisos.push({ id: Date.now() + "_" + l.id, para: l.id, osId: nova.id, em: Date.now(),
                                  t: nomeDe(sessao) + " designou a OS " + num(nova.id) + " para " + nomeDe(nova.tecId), s: nova.titulo + " · " + nova.setor });
                });
            }
            toast("OS " + num(nova.id) + " enviada para " + nomeDe(nova.tecId) + " ✔");
        } else {
            nova.origem = "campo";
            nova.tecId = sessao;
            nova.prior = "media";
            nova.status = "final";
            nova.concluida = base.data || hoje();
            nova.concluidaHora = horaAgora();
            nova.fotos = { antes: formFotos.antes.slice(), depois: formFotos.depois.slice() };
            nova.itens = formItens.slice();
            if (formAssin) nova.assinatura = formAssin;
            toast("Serviço registrado ✔");
        }
        ordens.push(nova);
    }

    salvar();
    filtro = "todas";
    soMinhas = false;
    ir("os");
}

/* ==========================================
   DETALHE DA OS
========================================== */
function abrirOS(id) {
    var o = buscar(id);
    if (!o) return;

    var adm = ehAdmin();
    var souEu = !adm && o.tecId === sessao;
    var p = PRIOR[o.prior], s = STAT[o.status];
    var podeFoto = souEu && (o.origem === "campo" || o.status === "andamento");
    var nome = esc(nomeDe(o.tecId));

    var h = '<div class="sheet-alca"></div>' +
    '<div class="linha-tags">' +
        '<span class="os-num">OS ' + num(o.id) + '</span>' +
        '<span class="tag-orig ' + (o.origem === "campo" ? "campo" : "") + '">' + (o.origem === "campo" ? "Campo" : "Designada") + '</span>' +
        '<span class="tag-p ' + p.c + '">' + p.t + '</span>' +
        '<span class="tag ' + s.c + '">' + s.t + '</span>' +
    '</div>' +
    '<h2>' + esc(o.titulo) + '</h2>';

    if (atrasada(o)) {
        h += '<div class="banner" style="background:#FDECEA;color:#C62828"><i class="fa-solid fa-triangle-exclamation"></i>Esta OS está <b>atrasada</b> (venceu em ' + fmtData(o.data) + ').</div>';
    }

    if (o.origem === "designada" && o.status === "aguardando") {
        if (souEu) h += '<div class="banner"><i class="fa-solid fa-hand-point-right"></i>Esta OS foi designada para <b>você</b>. Aceite para começar.</div>';
        else if (!adm) h += '<div class="banner trava"><i class="fa-solid fa-lock"></i>Esta OS é do(a) <b>' + nome + '</b>. Você pode visualizar, mas só ele(a) pode aceitar.</div>';
        else h += '<div class="banner"><i class="fa-solid fa-hourglass-half"></i>Aguardando o aceite de <b>' + nome + '</b>.</div>';
    }
    if (o.origem === "designada" && o.status === "andamento" && !souEu) {
        h += '<div class="banner trava"><i class="fa-solid fa-person-digging"></i><b>' + nome + '</b> está executando esta OS.</div>';
    }

    h += '<div class="grade-info">' +
        '<div><small>' + (o.origem === "campo" ? "Técnico" : "Designada para") + '</small><b>' + nome + '</b></div>' +
        '<div><small>Setor</small><b>' + esc(o.setor) + '</b></div>' +
        '<div><small>Tipo</small><b>' + esc(o.tipo) + '</b></div>' +
        '<div><small>' + (o.origem === "campo" ? "Data do serviço" : "Data prevista") + '</small><b' + (atrasada(o) ? ' style="color:#E53935"' : "") + '>' + fmtData(o.data) + '</b></div>' +
        (o.origem === "designada" ? '<div><small>Criada por</small><b>' + esc(nomeDe(o.criadaPor)) + '</b></div>' : "") +
        (o.aceitaEm ? '<div><small>Aceita em</small><b>' + fmtData(o.aceitaEm) + '</b></div>' : "") +
        (o.origem === "designada" && o.concluida ? '<div><small>Concluída em</small><b>' + fmtData(o.concluida) + '</b></div>' : "") +
    '</div>' +
    '<h4>' + (o.origem === "campo" ? "Serviço realizado" : "Descrição do serviço") + '</h4>' +
    '<div class="sheet-desc">' + (esc(o.desc) || "Sem descrição.") + '</div>';

    if (o.origem === "designada") {
        if (souEu && o.status === "andamento") {
            h += '<h4>Relatório do serviço (opcional)</h4>' +
                 '<textarea id="sRel" rows="3" maxlength="600" placeholder="O que foi feito, peças trocadas..." onchange="setRel(' + o.id + ',this.value)">' + esc(o.rel || "") + '</textarea>';
        } else if (o.rel) {
            h += '<h4>Relatório do técnico</h4><div class="sheet-desc">' + esc(o.rel) + '</div>';
        }
    }

    var mostrarFotos = o.origem === "campo" || o.status !== "aguardando";
    if (mostrarFotos) {
        h += '<h4>📷 Antes do serviço (' + o.fotos.antes.length + ')</h4>' + grupoFotos(o.id, "antes", o.fotos.antes, podeFoto) +
             '<h4>📷 Depois do serviço (' + o.fotos.depois.length + ')</h4>' + grupoFotos(o.id, "depois", o.fotos.depois, podeFoto);
        // toque na foto para ver, e aqui a explicação de como ela entra no PDF
        if ((o.fotos.antes.length + o.fotos.depois.length) && podeCompartilharOS(o)) {
            h += '<p class="dica" style="margin:0 0 10px"><i class="fa-solid fa-circle-info"></i> ' +
                 'As fotos entram no PDF do botão <b>Compartilhar PDF</b> (mais abaixo). ' +
                 '<b>Toque na foto</b> e use "Baixar"/"Salvar imagem" para mandar como imagem solta.</p>';
        }
    }

    if (mostrarFotos) {
        h += '<h4>📦 Materiais utilizados (<span id="itensN_' + o.id + '">' + o.itens.length + '</span>)</h4>' +
             '<div id="itensBox_' + o.id + '">' + itensInner(o.id, o.itens, podeFoto) + '</div>';
        var doEstoque = o.itens.filter(function (i) { return i.estId; }).length;
        var manuais = o.itens.length - doEstoque;
        if (doEstoque) {
            h += '<div class="banner"><i class="fa-solid fa-boxes-stacked"></i>' + (o.status === "final"
                ? 'Itens do estoque <b>baixados do saldo</b> ao finalizar esta OS.'
                : 'Itens do estoque serão <b>baixados do saldo quando a OS for finalizada</b>.') + '</div>';
        }
        if (adm && manuais) {
            h += o.baixa
                ? '<button class="btn-sec cheio" onclick="toggleBaixa(' + o.id + ')"><i class="fa-solid fa-circle-check"></i> Baixa feita em ' + fmtData(o.baixaEm) + ' · desfazer</button>'
                : '<button class="btn-pri verde cheio" onclick="toggleBaixa(' + o.id + ')"><i class="fa-solid fa-clipboard-check"></i> Marcar baixa no estoque</button>';
        }
    }

    var sigEditavel = souEu && (o.origem === "campo" || o.status !== "aguardando");
    if (sigEditavel) {
        h += '<h4>✍️ Assinatura do técnico</h4>' +
             '<canvas id="sigSheet" class="sig-pad"></canvas>' +
             '<div class="sig-acoes"><small>Assine dentro do quadro</small>' +
             '<button type="button" class="btn-sec" onclick="sigLimpar(\'sigSheet\')"><i class="fa-solid fa-eraser"></i> Limpar</button></div>';
    } else if (o.assinatura) {
        h += '<h4>✍️ Assinatura do técnico</h4><img class="sig-img" alt="Assinatura" src="' + o.assinatura + '">';
    }

    h += elogioHTML(o, adm);

    if (adm) {
        if (o.origem === "designada") {
            h += '<div class="sheet-acoes">' +
                 '<button class="btn-sec" onclick="editarOS(' + o.id + ')"><i class="fa-solid fa-pen"></i> Editar</button>' +
                 '<button class="btn-perigo" onclick="excluirOS(' + o.id + ')"><i class="fa-solid fa-trash"></i> Excluir</button></div>';
        } else {
            h += '<div class="sheet-acoes um"><button class="btn-perigo" onclick="excluirOS(' + o.id + ')"><i class="fa-solid fa-trash"></i> Excluir relatório</button></div>';
        }
    } else if (o.origem === "designada") {
        if (souEu && o.status === "aguardando") {
            h += '<div class="sheet-acoes um"><button class="btn-pri" onclick="aceitarOS(' + o.id + ')"><i class="fa-solid fa-circle-check"></i> Aceitar OS</button></div>';
        } else if (souEu && o.status === "andamento") {
            h += '<p class="dica" style="margin:0 0 10px">Fotos e materiais são opcionais, mas ajudam a documentar o serviço.</p>' +
                 '<div class="sheet-acoes um"><button class="btn-pri verde" onclick="finalizarOS(' + o.id + ')"><i class="fa-solid fa-flag-checkered"></i> Finalizar OS</button></div>';
        } else if (!souEu && o.status === "aguardando") {
            h += '<div class="sheet-acoes um"><button class="btn-pri btn-desab" disabled><i class="fa-solid fa-lock"></i> Só ' + nome + ' pode aceitar</button></div>';
        } else if (souEu && o.status === "final") {
            h += '<div class="sheet-acoes um"><button class="btn-sec" onclick="editarOS(' + o.id + ')"><i class="fa-solid fa-pen"></i> Editar OS</button></div>';
        }
    } else if (souEu) {
        h += '<div class="sheet-acoes um"><button class="btn-sec" onclick="editarOS(' + o.id + ')"><i class="fa-solid fa-pen"></i> Editar relatório</button></div>';
    }

    // O técnico também pode passar a OS para outro técnico (como o líder)
    if (!adm && souEu && o.origem === "designada" && o.status !== "final" && tecnicos().length > 1) {
        h += '<div class="sheet-acoes um"><button class="btn-sec" onclick="abrirAtribuir(' + o.id + ')"><i class="fa-solid fa-user-group"></i> Atribuir a outro técnico</button></div>';
    }

    // Compartilhar o PDF da OS (líder ou técnico dono da OS)
    if (podeCompartilharOS(o)) {
        h += '<div class="sheet-acoes um"><button class="btn-pri" onclick="pdfOS(' + o.id + ')">' +
             '<i class="fa-solid fa-file-pdf"></i> Compartilhar PDF</button></div>' +
             '<div class="sheet-acoes um"><button class="btn-sec" onclick="copiarOS(' + o.id + ')">' +
             '<i class="fa-solid fa-copy"></i> Copiar resumo</button></div>';
    }

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    if (sigEditavel) {
        sigIniciar("sigSheet", o.assinatura || "", function (v) {
            if (v) o.assinatura = v; else delete o.assinatura;
            salvar();
        });
    }
}

/* ==========================================
   ASSINATURA (quadro para assinar com o dedo)
   Guarda uma imagem pequena (JPEG) no campo "assinatura" da OS.
========================================== */
var sigCb = {};

function sigIniciar(id, valor, aoMudar) {
    var c = $(id);
    if (!c) return;
    sigCb[id] = aoMudar;
    var LW = 600, LH = 200;
    c.width = LW;
    c.height = LH;
    var x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, LW, LH);
    x.strokeStyle = "#111";
    x.fillStyle = "#111";
    x.lineWidth = 3.5;
    x.lineCap = "round";
    x.lineJoin = "round";
    if (valor) {
        var im = new Image();
        im.onload = function () { x.drawImage(im, 0, 0, LW, LH); };
        im.src = valor;
    }

    var desenhando = false, ult = null;
    function pos(e) {
        var r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) * LW / r.width, y: (e.clientY - r.top) * LH / r.height };
    }
    c.onpointerdown = function (e) {
        e.preventDefault();
        desenhando = true;
        ult = pos(e);
        try { c.setPointerCapture(e.pointerId); } catch (er) {}
        x.beginPath();
        x.arc(ult.x, ult.y, 1.8, 0, Math.PI * 2);
        x.fill();
    };
    c.onpointermove = function (e) {
        if (!desenhando) return;
        e.preventDefault();
        var p = pos(e);
        x.beginPath();
        x.moveTo(ult.x, ult.y);
        x.lineTo(p.x, p.y);
        x.stroke();
        ult = p;
    };
    function fim() {
        if (!desenhando) return;
        desenhando = false;
        if (sigCb[id]) sigCb[id](c.toDataURL("image/jpeg", 0.85));
    }
    c.onpointerup = fim;
    c.onpointercancel = fim;
}

function sigLimpar(id) {
    var c = $(id);
    if (!c) return;
    var x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#111";
    if (sigCb[id]) sigCb[id]("");
}

function fecharOS() {
    $("overlay").classList.remove("on");
    $("sheet").classList.remove("on");
    document.body.classList.remove("folha-aberta");
}

/* ==========================================
   COMPARTILHAR OS FINALIZADA NO WHATSAPP
   Monta um resumo em texto (sem HTML) e abre o WhatsApp já com a mensagem.
   Se o app não conseguir abrir sozinho (celular bloqueando), o resumo fica
   copiado para a área de transferência e o usuário cola onde quiser.
========================================== */
function podeCompartilharOS(o) {
    if (!o) return false;
    return ehAdmin() || o.tecId === sessao;
}

function resumoOS(o) {
    var L = [];
    var tituloApp = (empresa && empresa.nome) ? empresa.nome : "Controle de Manutenção";
    var situacao = o.status === "final" ? "Serviço concluído"
                 : o.status === "andamento" ? "Em andamento"
                 : "Aguardando início";
    L.push("*" + tituloApp + "*");
    L.push("*OS " + num(o.id) + " — " + situacao + "*");
    L.push("");
    L.push("*Serviço:* " + (o.titulo || "—"));
    L.push("*Setor:* " + (o.setor || "—"));
    L.push("*Tipo:* " + (o.tipo || "—"));
    L.push("*Técnico:* " + nomeDe(o.tecId));

    var dataServico = (o.origem === "campo" ? o.data : (o.concluida || o.data));
    if (dataServico) L.push("*Data:* " + fmtData(dataServico));

    if (o.desc) { L.push(""); L.push("*Descrição:*"); L.push(o.desc); }
    if (o.rel) { L.push(""); L.push("*Relatório do serviço:*"); L.push(o.rel); }

    if (o.itens && o.itens.length) {
        L.push("");
        L.push("*Materiais utilizados:*");
        o.itens.forEach(function (it) {
            L.push("• " + nomeItem(it) + " — " + fmtQtd(it.qtd) + " " + (it.un || "un"));
        });
    }

    // Fotos: manda o link das que já estão no servidor (Supabase Storage).
    // Foto ainda só neste aparelho (base64) não tem endereço: entra só na contagem.
    var fAntes = (o.fotos && o.fotos.antes) || [];
    var fDepois = (o.fotos && o.fotos.depois) || [];
    function soLinks(arr) {
        return arr.filter(function (f) { return typeof f === "string" && f.indexOf("http") === 0; });
    }
    var lkAntes = soLinks(fAntes), lkDepois = soLinks(fDepois);
    var semLink = (fAntes.length - lkAntes.length) + (fDepois.length - lkDepois.length);
    var MAX_LINKS = 6;   // por grupo: evita estourar o limite de tamanho da mensagem

    function blocoFotos(titulo, links) {
        if (!links.length) return;
        L.push("");
        L.push("*" + titulo + " (" + links.length + "):*");
        links.slice(0, MAX_LINKS).forEach(function (u, i) { L.push((i + 1) + ". " + u); });
        if (links.length > MAX_LINKS) L.push("+ " + (links.length - MAX_LINKS) + " foto(s) no app");
    }
    blocoFotos("Fotos antes", lkAntes);
    blocoFotos("Fotos depois", lkDepois);
    if (semLink) {
        L.push("");
        L.push("_" + semLink + (semLink === 1 ? " foto ainda não foi enviada ao servidor e não tem link." : " fotos ainda não foram enviadas ao servidor e não têm link.") + "_");
    }

    L.push("");
    L.push("_Enviado pelo app de manutenção em " + fmtData(hoje()) + "_");
    return L.join("\n");
}

function compartilharOS(id) {
    var o = buscar(id);
    if (!o) return;
    if (!podeCompartilharOS(o)) { toast("Você só pode compartilhar as suas OS."); return; }

    var texto = resumoOS(o);

    // whatsapp:// funciona melhor no celular; wa.me é o plano B (computador)
    var urlApp = "whatsapp://send?text=" + encodeURIComponent(texto);
    var urlWeb = "https://wa.me/?text=" + encodeURIComponent(texto);

    try {
        // copia antes de sair do app: se o WhatsApp não abrir, a mensagem não se perde
        copiarTexto(texto);
        window.location.href = urlApp;
        setTimeout(function () {
            if (!document.hidden) {
                window.open(urlWeb, "_blank");
                toast("Resumo copiado. Se o WhatsApp não abrir, cole na conversa.");
            }
        }, 1200);
    } catch (e) {
        window.open(urlWeb, "_blank");
    }
}

function copiarOS(id) {
    var o = buscar(id);
    if (!o) return;
    copiarTexto(resumoOS(o)).then(function (ok) {
        toast(ok ? "Resumo copiado. Cole na conversa do WhatsApp." : "Não foi possível copiar. Selecione o texto manualmente.");
    });
}

/* ==========================================
   PDF DA OS (compartilhar no WhatsApp)
   Gera o PDF no próprio aparelho (jsPDF) e abre o menu de compartilhar
   do celular, onde se escolhe o WhatsApp. Sem suporte (computador),
   o arquivo é baixado.
========================================== */
function pdfTexto(t) {
    // a fonte padrão do PDF não tem emoji nem símbolos fora do Latin-1
    return String(t == null ? "" : t).replace(/[^\u0020-\u00FF\u2013\u2014\u2022\n]/g, "");
}

// Devolve {data, w, h} com a imagem já reduzida para entrar no PDF.
// A foto pode estar como base64 (base64 é o formato em que ela é gravada) ou como
// link do Supabase. Neste caso o app baixa a foto e a lê como base64 antes de
// desenhar: um <img> apontando direto para o link pode não deixar o canvas ler a
// imagem (o PDF saía com a caixa vazia, sem aviso nenhum).
function pdfDesenhar(img) {
    try {
        var max = 900, w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return null;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        var cx = c.getContext("2d");
        cx.fillStyle = "#fff";
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0, c.width, c.height);
        return { data: c.toDataURL("image/jpeg", 0.75), w: c.width, h: c.height };
    } catch (e) {
        return null;      // canvas bloqueado (imagem "suja")
    }
}

function pdfImagemDe(url) {
    return new Promise(function (resolve) {
        var img = new Image();
        var t = setTimeout(function () { resolve(null); }, 8000);
        img.onload = function () { clearTimeout(t); resolve(pdfDesenhar(img)); };
        img.onerror = function () { clearTimeout(t); resolve(null); };
        img.src = url;
    });
}

function pdfFotoBase64(link) {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(link, { cache: "no-store" }).then(function (r) {
        if (!r || !r.ok) return null;
        return r.blob();
    }).then(function (b) {
        if (!b) return null;
        return new Promise(function (res) {
            var fr = new FileReader();
            fr.onload = function () { res(fr.result); };
            fr.onerror = function () { res(null); };
            fr.readAsDataURL(b);
        });
    }).then(function (d) {
        if (typeof d !== "string" || d.indexOf("data:image") !== 0) return null;
        return pdfImagemDe(d);
    }).catch(function () { return null; });
}

function pdfCarregarImagem(src) {
    if (typeof src !== "string" || !src) return Promise.resolve(null);
    if (src.indexOf("data:image") === 0) return pdfImagemDe(src);
    // link do servidor: baixa primeiro (caminho mais confiável no celular)
    return pdfFotoBase64(src).then(function (im) {
        return im || pdfImagemDe(src);
    });
}

async function pdfMontarOS(o) {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) throw new Error("jspdf");

    var doc = new J({ unit: "mm", format: "a4" });
    var LM = 12, W = 186, PH = 297, TOPO = 14, FIM = PH - 20;
    var AZUL = [111, 168, 220], BORDA = [205, 210, 218];
    var y = TOPO;

    var logo = (empresa && empresa.logo) ? await pdfCarregarImagem(empresa.logo) : null;

    function novaPagina() { doc.addPage(); y = TOPO; }
    function cabe(h) { if (y + h > FIM) novaPagina(); }
    function cor(c) { doc.setTextColor(c[0], c[1], c[2]); }

    // Faixa azul de seção
    function secao(t) {
        cabe(18);
        y += 1;
        doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
        doc.rect(LM, y, W, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        cor([20, 20, 20]);
        doc.text(pdfTexto(t), LM + 2, y + 5.4);
        y += 8;
    }

    // Linha de campos curtos em colunas (cada par: [rótulo, valor])
    function linha(pares) {
        var n = pares.length, cw = W / n, alt = 0, i;
        doc.setFontSize(9.5);
        var blocos = pares.map(function (p) {
            doc.setFont("helvetica", "normal");
            var ls = doc.splitTextToSize(pdfTexto(p[1] || ""), cw - 4);
            return ls;
        });
        blocos.forEach(function (ls) { alt = Math.max(alt, 9 + Math.max(1, ls.length) * 4.2); });
        cabe(alt);
        doc.setDrawColor(BORDA[0], BORDA[1], BORDA[2]);
        for (i = 0; i < n; i++) {
            var x = LM + i * cw;
            doc.rect(x, y, cw, alt);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); cor([40, 40, 40]);
            doc.text(pdfTexto(pares[i][0]), x + 2, y + 4);
            doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); cor([30, 30, 30]);
            blocos[i].forEach(function (l, k) { doc.text(l, x + 2, y + 8.5 + k * 4.2); });
        }
        y += alt;
    }

    // Campo de texto longo (largura total), pode continuar na página seguinte
    function bloco(rotulo, texto) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
        var ls = doc.splitTextToSize(pdfTexto(texto || "—"), W - 4);
        var i = 0, primeiro = true;
        doc.setDrawColor(BORDA[0], BORDA[1], BORDA[2]);
        while (i < ls.length) {
            cabe(primeiro ? 16 : 10);
            var topo = primeiro ? 8.5 : 3.5;
            var maxL = Math.max(1, Math.floor((FIM - y - topo - 2) / 4.2));
            var parte = ls.slice(i, i + maxL);
            var alt = topo + parte.length * 4.2 + 2;
            doc.rect(LM, y, W, alt);
            if (primeiro && rotulo) {
                doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); cor([40, 40, 40]);
                doc.text(pdfTexto(rotulo), LM + 2, y + 4);
            }
            doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); cor([30, 30, 30]);
            parte.forEach(function (l, k) { doc.text(l, LM + 2, y + topo + 3 + k * 4.2 - 1.2); });
            y += alt;
            i += parte.length;
            primeiro = false;
        }
    }

    // Grade de fotos (3 por linha), cada uma dentro de uma caixa com borda
    async function fotos(rotulo, arr) {
        arr = (arr || []).slice(0, 24);
        if (!arr.length) return;
        var cw = W / 3, ch = 62, col = 0, falhas = 0;
        cabe(ch + 10);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); cor([40, 40, 40]);
        doc.setDrawColor(BORDA[0], BORDA[1], BORDA[2]);
        doc.rect(LM, y, W, 6);
        doc.text(pdfTexto(rotulo + " (" + arr.length + ")"), LM + 2, y + 4);
        y += 6;
        for (var i = 0; i < arr.length; i++) {
            var im = await pdfCarregarImagem(arr[i]);
            if (col === 0) cabe(ch);
            var x = LM + col * cw;
            doc.rect(x, y, cw, ch);
            if (im) {
                var mw = cw - 4, mh = ch - 4;
                var w = mw, h = w * im.h / im.w;
                if (h > mh) { h = mh; w = h * im.w / im.h; }
                doc.addImage(im.data, "JPEG", x + (cw - w) / 2, y + (ch - h) / 2, w, h);
            } else {
                // nunca sai uma caixa vazia sem explicação
                falhas++;
                doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); cor([150, 150, 150]);
                doc.text("foto nao carregou", x + cw / 2, y + ch / 2, { align: "center" });
            }
            col++;
            if (col === 3) { y += ch; col = 0; }
        }
        if (col > 0) {
            for (var k = col; k < 3; k++) doc.rect(LM + k * cw, y, cw, ch);
            y += ch;
        }
        if (falhas) { pdfFotosFalhas += falhas; y += 2; }
    }

    // ---------- Cabeçalho ----------
    var nomeEmp = (empresa && empresa.nome) ? empresa.nome : "Controle de Manutenção";
    if (logo) {
        var lh = 20, lw = lh * logo.w / logo.h;
        if (lw > 40) { lw = 40; lh = lw * logo.h / logo.w; }
        doc.addImage(logo.data, "JPEG", LM, y, lw, lh);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(17); cor([30, 30, 30]);
    var tit = doc.splitTextToSize(pdfTexto("Ordem de Serviço - " + (o.titulo || "")), 110);
    tit.slice(0, 3).forEach(function (l, k) { doc.text(l, 105, y + 8 + k * 7, { align: "center" }); });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); cor([70, 110, 160]);
    doc.text(pdfTexto("OS " + num(o.id)), LM + W, y + 8, { align: "right" });
    y += 26;

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); cor([60, 60, 60]);
    doc.text(pdfTexto("Por: " + nomeDe(o.tecId)), LM, y);
    doc.text(pdfTexto("Em: " + fmtData(o.criada || hoje())), LM + W, y, { align: "right" });
    y += 5;

    var p = PRIOR[o.prior], s = STAT[o.status];

    // ---------- Seções ----------
    secao("Empresa responsável");
    linha([["Nome", nomeEmp]]);

    secao("Ordem de serviço");
    linha([["Serviço", o.titulo], ["Setor", o.setor]]);
    linha([["Tipo", o.tipo], ["Prioridade", p ? p.t : ""]]);
    linha([["Técnico", nomeDe(o.tecId)], ["Situação", s ? s.t : ""]]);
    var datas = [];
    if (o.origem === "campo" && o.status === "final") {
        datas.push(["Data do serviço", fmtDataHoraOS(o.data || o.concluida, o.concluidaHora)]);
    } else {
        datas.push([o.origem === "campo" ? "Data do serviço" : "Prazo", fmtData(o.data)]);
        if (o.status === "final") datas.push(["Concluída em", fmtDataHoraOS(o.concluida || o.data, o.concluidaHora)]);
    }
    linha(datas);

    if (o.desc) { secao("Descrição do problema"); bloco("Descrição", o.desc); }
    if (o.rel) { secao("Solução / Relatório do serviço"); bloco("Serviços realizados", o.rel); }

    if (o.itens && o.itens.length) {
        secao("Peças / Materiais");
        bloco("Materiais utilizados", o.itens.map(function (it) {
            return "- " + nomeItem(it) + " - " + fmtQtd(it.qtd) + " " + (it.un || "un");
        }).join("\n"));
    }

    pdfFotosFalhas = 0;
    var temFoto = o.fotos && ((o.fotos.antes || []).length || (o.fotos.depois || []).length);
    if (temFoto) {
        secao("Registro fotográfico");
        await fotos("Antes do serviço", o.fotos.antes);
        await fotos("Depois do serviço", o.fotos.depois);
    }

    // ---------- Fim do trabalho ----------
    secao("Fim do Trabalho");
    cabe(30);
    doc.setDrawColor(BORDA[0], BORDA[1], BORDA[2]);
    var h1 = 26;
    doc.rect(LM, y, W / 2, h1);
    doc.rect(LM + W / 2, y, W / 2, h1);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); cor([40, 40, 40]);
    doc.text("Data", LM + 2, y + 4);
    doc.text("Assinatura do técnico", LM + W / 2 + 2, y + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); cor([30, 30, 30]);
    doc.text(pdfTexto(o.status === "final" ? fmtDataHoraOS(o.concluida || o.data, o.concluidaHora) : fmtDataHoraOS(hoje(), horaAgora())), LM + 2, y + 9);
    if (o.assinatura) {
        try {
            var sw = W / 2 - 24, sh = sw / 3;
            if (sh > 15) { sh = 15; sw = sh * 3; }
            doc.addImage(o.assinatura, "JPEG", LM + W * 0.75 - sw / 2, y + 18.5 - sh, sw, sh);
        } catch (e) {}
    }
    doc.setDrawColor(120, 120, 120);
    doc.line(LM + W / 2 + 10, y + 19, LM + W - 10, y + 19);
    doc.setFontSize(8.5); cor([90, 90, 90]);
    doc.text(pdfTexto(nomeDe(o.tecId)), LM + W * 0.75, y + 23, { align: "center" });
    y += h1;

    // ---------- Rodapé em todas as páginas ----------
    var n = doc.getNumberOfPages();
    for (var pg = 1; pg <= n; pg++) {
        doc.setPage(pg);
        doc.setDrawColor(190, 190, 190);
        doc.line(LM, PH - 17, LM + W, PH - 17);
        if (logo) {
            var fh = 11, fw = fh * logo.w / logo.h;
            if (fw > 28) { fw = 28; fh = fw * logo.h / logo.w; }
            doc.addImage(logo.data, "JPEG", LM, PH - 15.5, fw, fh);
        } else {
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); cor([90, 90, 90]);
            doc.text(pdfTexto(nomeEmp), LM, PH - 10);
        }
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); cor([130, 130, 130]);
        doc.text("Gerado em " + fmtData(hoje()) + " - página " + pg + " de " + n, LM + W, PH - 10, { align: "right" });
    }
    return doc;
}

// quantas fotos não puderam ser carregadas no último PDF gerado
var pdfFotosFalhas = 0;

async function pdfOS(id) {
    var o = buscar(id);
    if (!o) return;
    if (!podeCompartilharOS(o)) { toast("Você só pode compartilhar as suas OS."); return; }

    var temFoto = o.fotos && ((o.fotos.antes || []).length || (o.fotos.depois || []).length);
    toast(temFoto ? "Gerando o PDF com as fotos..." : "Gerando o PDF...");
    var doc;
    try {
        doc = await pdfMontarOS(o);
    } catch (e) {
        console.error("PDF:", e);
        toast(e && e.message === "jspdf"
            ? "Não carregou o gerador de PDF. Conecte à internet e abra o app de novo."
            : "Não foi possível gerar o PDF.");
        return;
    }

    if (pdfFotosFalhas) {
        toast(pdfFotosFalhas + (pdfFotosFalhas === 1 ? " foto não carregou" : " fotos não carregaram") +
            " agora. Abra o PDF de novo com internet para tentar de novo.");
    }

    var nomeArq = "OS-" + String(o.id).padStart(4, "0") + ".pdf";
    var blob = doc.output("blob");
    var arquivo = null;
    try { arquivo = new File([blob], nomeArq, { type: "application/pdf" }); } catch (e) {}

    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
            await navigator.share({ files: [arquivo], title: "OS " + num(o.id) });
            return;
        } catch (e) {
            if (e && e.name === "AbortError") return;   // a pessoa fechou o menu
        }
    }

    toast("PDF pronto. Anexe o arquivo na conversa do WhatsApp.");
    // Plano B: baixa o arquivo para anexar no WhatsApp
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nomeArq;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    toast("PDF baixado. Anexe na conversa do WhatsApp.");
}

function copiarTexto(t) {
    // navigator.clipboard só existe em https/localhost; o plano B usa textarea
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(t).then(function () { return true; }).catch(function () { return copiarTextoAntigo(t); });
    }
    return Promise.resolve(copiarTextoAntigo(t));
}

function copiarTextoAntigo(t) {
    try {
        var a = document.createElement("textarea");
        a.value = t;
        a.setAttribute("readonly", "");
        a.style.position = "fixed";
        a.style.top = "-1000px";
        document.body.appendChild(a);
        a.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(a);
        return ok;
    } catch (e) {
        return false;
    }
}

function setRel(id, v) {
    var o = buscar(id);
    if (o) { o.rel = v; salvar(); }
}

function aceitarOS(id) {
    var o = buscar(id);
    if (!o || o.origem !== "designada" || o.status !== "aguardando") return;
    if (ehAdmin() || o.tecId !== sessao) { toast("Só o técnico designado pode aceitar"); return; }
    o.status = "andamento";
    o.aceitaEm = hoje();
    // avisa o(s) líder(es)
    usuarios.filter(function (u) { return u.papel === "admin"; }).forEach(function (l) {
        avisos.push({ id: Date.now() + "_" + l.id, para: l.id, osId: o.id, em: Date.now(),
                      t: nomeDe(sessao) + " aceitou a OS " + num(o.id), s: o.titulo + " · " + o.setor });
    });
    salvar();
    abrirOS(id);
    renderTudo();
    toast("OS aceita! Bom trabalho 💪");
}

function abrirAtribuir(id) {
    var o = buscar(id);
    if (!o || o.origem !== "designada" || o.status === "final") return;
    if (ehAdmin() || o.tecId !== sessao) return;
    var outros = tecnicos().filter(function (u) { return u.id !== o.tecId; });
    var h = '<div class="sheet-alca"></div><h2>Atribuir OS ' + num(o.id) + '</h2>' +
        '<p class="dica" style="margin:0 0 12px">' + esc(o.titulo) + '</p>';
    if (!outros.length) {
        h += '<div class="vazio"><i class="fa-solid fa-user-slash"></i>Não há outro técnico cadastrado.</div>';
    } else {
        h += '<label class="campo"><span>Passar para</span><select id="atribTec"><option value="">Selecione o técnico</option>' +
            outros.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nome) + " — " + esc(u.funcao) + "</option>"; }).join("") +
            '</select></label>' +
            '<p class="dica">O técnico escolhido precisará aceitar a OS e o líder será avisado.</p>';
    }
    h += '<div class="sheet-acoes"><button class="btn-sec" onclick="abrirOS(' + o.id + ')">Cancelar</button>' +
         (outros.length ? '<button class="btn-pri" style="margin-top:0" onclick="confirmarAtribuir(' + o.id + ')"><i class="fa-solid fa-check"></i> Atribuir</button>' : "") + '</div>';
    $("sheet").innerHTML = h;
}

function confirmarAtribuir(id) {
    var o = buscar(id);
    if (!o || o.origem !== "designada" || o.status === "final") return;
    if (ehAdmin() || o.tecId !== sessao) return;
    var novo = Number($("atribTec").value);
    if (!novo || novo === o.tecId || !userPorId(novo)) { toast("Escolha o técnico"); return; }
    var antigo = sessao;
    o.tecId = novo;
    o.status = "aguardando";
    o.aceitaEm = "";
    // avisa o(s) líder(es)
    usuarios.filter(function (u) { return u.papel === "admin"; }).forEach(function (l) {
        avisos.push({ id: Date.now() + "_" + l.id, para: l.id, osId: o.id, em: Date.now(),
                      t: nomeDe(antigo) + " passou a OS " + num(o.id) + " para " + nomeDe(novo), s: o.titulo + " · " + o.setor });
    });
    salvar();
    fecharOS();
    renderTudo();
    toast("OS " + num(o.id) + " atribuída a " + nomeDe(novo) + " ✔");
}

// Antes de finalizar: cada peça do estoque lançada na OS precisa ter saldo (a baixa acontece agora)
function faltaEstoque(o) {
    var tot = {};
    (o.itens || []).forEach(function (i) { if (i.estId) tot[i.estId] = arred((tot[i.estId] || 0) + i.qtd); });
    for (var id in tot) {
        var e = estItem(id);
        if (!e) continue;
        var saldo = saldoEstoque(e);
        if (tot[id] > saldo) {
            return "Sem saldo de " + e.nome + " para finalizar: precisa de " + fmtQtd(tot[id]) + " " + e.un +
                   " e há " + fmtQtd(Math.max(saldo, 0)) + ". Ajuste a quantidade da peça.";
        }
    }
    return "";
}

function finalizarOS(id) {
    var o = buscar(id);
    if (!o || o.status !== "andamento" || o.tecId !== sessao) return;
    if (itemPendente(o.id) && !addItem(o.id)) return;   // item preenchido e ainda não adicionado
    var falta = faltaEstoque(o);
    if (falta) { toast(falta); return; }
    var rel = $("sRel");
    if (rel) o.rel = rel.value;
    o.status = "final";
    o.concluida = hoje();
    o.concluidaHora = horaAgora();
    delete o.zerada;
    salvar();
    abrirOS(id);
    renderTudo();
    toast("OS finalizada ✔");
}

/* ==========================================
   EQUIPE: aniversários, ranking, conquistas, meta e elogios
   (tudo é calculado a partir das OS; só o aniversário, as conquistas
   já comemoradas, a meta e o elogio ficam guardados)
========================================== */
function mesDe(s) { return s ? String(s).slice(0, 7) : ""; }
function mesAtual() { return hoje().slice(0, 7); }
function mesAnterior() {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return iso(d).slice(0, 7);
}
function nomeMes(ym) {
    var n = MESES[Number(ym.slice(5, 7)) - 1] || "";
    return n.charAt(0).toUpperCase() + n.slice(1);
}

/* ----- Aniversários ----- */
function anoBissexto(a) { return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0; }

function aniversariantesDoDia(data) {
    var md = String(data).slice(5), ano = Number(String(data).slice(0, 4));
    return usuarios.filter(function (u) {
        if (!u.nasc || !/^\d{4}-\d{2}-\d{2}$/.test(u.nasc)) return false;
        var n = u.nasc.slice(5);
        if (n === "02-29" && !anoBissexto(ano)) n = "02-28";
        return n === md;
    });
}

function irNiver(data) {
    fecharOS();
    calSel = data;
    var d = dataDe(data);
    calMes = new Date(d.getFullYear(), d.getMonth(), 1);
    ir("calendario");
}

function confeteHTML() {
    var cores = ["#EC407A", "#FFCA28", "#42A5F5", "#66BB6A", "#AB47BC", "#FF7043"];
    var s = "";
    for (var i = 0; i < 24; i++) {
        s += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cores[i % cores.length] +
             ';animation-delay:' + (Math.random() * 3).toFixed(1) + 's;animation-duration:' + (2.8 + Math.random() * 2).toFixed(1) + 's"></i>';
    }
    return '<div class="confete">' + s + '</div>';
}

function festaHTML() {
    var lista = aniversariantesDoDia(hoje()), h = "";
    var eu = lista.filter(function (u) { return u.id === sessao; })[0];
    if (eu) {
        h += '<div class="festa">' + confeteHTML() + '<div class="festa-ic">🎉</div>' +
             '<div><b>Parabéns, ' + esc(eu.nome) + '!</b><small>Hoje é o seu dia. A equipe de manutenção deseja muita saúde e sucesso!</small></div></div>';
    }
    return h;
}

/* ----- Meta da equipe ----- */
function metaInfo() {
    var m = mesAtual();
    var feitas = ordens.filter(function (o) { return o.status === "final" && mesDe(o.concluida) === m; }).length;
    return { meta: Number(empresa && empresa.meta) || 0, feitas: feitas };
}

function metaHTML() {
    if (ehCompras()) return "";
    var i = metaInfo(), adm = ehAdmin();
    if (!i.meta) {
        return adm ? '<div class="meta-card vazia" onclick="abrirMeta()"><i class="fa-solid fa-bullseye"></i>' +
            '<div><b>Meta da equipe</b><small>Toque para definir quantas OS a equipe quer finalizar por mês</small></div></div>' : "";
    }
    var pct = Math.min(100, Math.round(i.feitas * 100 / i.meta)), bateu = i.feitas >= i.meta;
    return '<div class="meta-card' + (bateu ? " ok" : "") + '"' + (adm ? ' onclick="abrirMeta()"' : "") + '>' +
        '<div class="meta-topo"><span><i class="fa-solid fa-bullseye"></i> Meta de ' + nomeMes(mesAtual()) + '</span><b>' + i.feitas + ' / ' + i.meta + '</b></div>' +
        '<div class="meta-barra"><i style="width:' + pct + '%"></i></div>' +
        '<small>' + (bateu ? '🎉 Meta batida! Parabéns, equipe!' + (i.feitas > i.meta ? ' (+' + (i.feitas - i.meta) + ')' : '')
                            : 'Faltam ' + (i.meta - i.feitas) + (i.meta - i.feitas === 1 ? ' OS finalizada' : ' OS finalizadas') + ' para bater a meta') + '</small></div>';
}

function abrirMeta() {
    if (!ehAdmin()) return;
    var i = metaInfo();
    var h = '<div class="sheet-alca"></div><h2>🎯 Meta da equipe</h2>' +
        '<p class="dica" style="margin:0 0 12px">Quantas OS finalizadas a equipe quer fechar por mês. A meta vale para todos os meses até você mudar.</p>' +
        '<label class="campo"><span>OS finalizadas por mês</span><input type="text" id="metaVal" inputmode="numeric" maxlength="4" placeholder="Ex: 30" value="' + (i.meta || "") + '"></label>' +
        '<div class="sheet-acoes"><button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
        '<button class="btn-pri" style="margin-top:0" onclick="salvarMeta()"><i class="fa-solid fa-check"></i> Salvar</button></div>' +
        (i.meta ? '<div class="sheet-acoes um" style="margin-top:10px"><button class="btn-perigo" onclick="removerMeta()"><i class="fa-solid fa-ban"></i> Remover meta</button></div>' : "");
    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

function salvarMeta() {
    var n = Math.floor(Number(String($("metaVal").value).replace(/\D/g, "")) || 0);
    if (n < 1) { toast("Informe um número maior que zero"); return; }
    empresa.meta = n;
    salvar();
    fecharOS();
    renderTudo();
    toast("Meta definida ✔");
}

function removerMeta() {
    empresa.meta = 0;
    salvar();
    fecharOS();
    renderTudo();
    toast("Meta removida");
}

/* ----- Pontos e ranking do mês ----- */
function osDoTec(tecId) {
    return ordens.filter(function (o) { return o.tecId === tecId && o.status === "final" && o.concluida && !o.zerada; });
}
function noPrazo(o) { return o.origem === "designada" && !!o.data && o.concluida <= o.data; }
function temFotos(o) {
    return !!(o.fotos && o.fotos.antes && o.fotos.depois && o.fotos.antes.length && o.fotos.depois.length);
}
function pontosOS(o) {
    var p = 10;                                                    // OS finalizada
    if (noPrazo(o)) p += 5;                                        // entregue no prazo
    if (temFotos(o)) p += 3;                                       // fotos de antes e depois
    if (o.origem === "designada" && (o.rel || "").trim()) p += 2;  // relatório preenchido
    if (o.elogio) p += 5;                                          // elogio do líder
    return p;
}
/* Perda de pontos por atraso: cada dia depois do prazo de uma OS designada custa
   PENAL_DIA pontos, até PENAL_MAX_DIAS dias por OS (teto de -10). Vale para a OS ainda
   aberta (o desconto vai crescendo a cada dia) e para a que foi finalizada com atraso.
   O desconto cai no período (semana/mês) em que o dia de atraso aconteceu. */
var PENAL_DIA = 2;
var PENAL_MAX_DIAS = 5;
function penalidadeTec(tecId, ini, fim) {
    var zero = (empresa && empresa.zeroEm) || "", hj = hoje(), total = 0;
    ordens.forEach(function (o) {
        if (o.tecId !== tecId || o.origem !== "designada" || !o.data || o.zerada) return;
        if (o.status !== "aguardando" && o.status !== "andamento" && o.status !== "final") return;
        var fimAtraso = o.status === "final" ? o.concluida : hj;
        if (!fimAtraso) return;
        for (var k = 1; k <= PENAL_MAX_DIAS; k++) {
            var d = addDias(o.data, k);
            if (d > fimAtraso) break;
            if (d < ini || d > fim || d <= zero) continue;   // fora do período ou antes do "zerar tudo"
            total += PENAL_DIA;
        }
    });
    return total;
}
function pontosDoMes(tecId, mes) {
    var t = 0, n = 0;
    osDoTec(tecId).forEach(function (o) {
        if (mesDe(o.concluida) === mes) { t += pontosOS(o); n++; }
    });
    var pen = penalidadeTec(tecId, mes + "-01", mes + "-31");
    return { pts: t - pen, n: n, pen: pen };
}
function rankingMes(mes) {
    return usuarios.filter(function (u) { return u.papel === "tecnico"; }).map(function (u) {
        var r = pontosDoMes(u.id, mes);
        return { u: u, pts: r.pts, n: r.n, pen: r.pen };
    }).sort(function (a, b) { return b.pts - a.pts || b.n - a.n || a.u.nome.localeCompare(b.u.nome); });
}

/* ----- Ranking semanal (segunda a domingo) ----- */
function addDias(data, n) {
    var d = dataDe(data);
    d.setDate(d.getDate() + n);
    return iso(d);
}
function semanaIni(data) {   // segunda-feira da semana de "data"
    var d = dataDe(data);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
}
function pontosDoPeriodo(tecId, ini, fim) {
    var t = 0, n = 0;
    osDoTec(tecId).forEach(function (o) {
        if (o.concluida >= ini && o.concluida <= fim) { t += pontosOS(o); n++; }
    });
    var pen = penalidadeTec(tecId, ini, fim);
    return { pts: t - pen, n: n, pen: pen };
}
function rankingSemana(ini) {
    var fim = addDias(ini, 6);
    return usuarios.filter(function (u) { return u.papel === "tecnico"; }).map(function (u) {
        var r = pontosDoPeriodo(u.id, ini, fim);
        return { u: u, pts: r.pts, n: r.n, pen: r.pen };
    }).sort(function (a, b) { return b.pts - a.pts || b.n - a.n || a.u.nome.localeCompare(b.u.nome); });
}
// vencedores da semana: quem empatar em pontos e em OS com o 1º divide o título
function vencedoresSemana(ini) {
    var rk = rankingSemana(ini), topo = rk[0];
    if (!topo || topo.pts <= 0) return [];
    return rk.filter(function (x) { return x.pts === topo.pts && x.n === topo.n; });
}

var rankModo = "semana";
function setRankModo(m) { rankModo = m; renderRanking(); }

function renderRanking() {
    var box = $("rankCard");
    if (!box) return;
    var sem = rankModo !== "mes";
    var ini = semanaIni(hoje());
    var r = sem ? rankingSemana(ini) : rankingMes(mesAtual());
    if (!r.length) { box.style.display = "none"; return; }
    box.style.display = "";
    var medalhas = ["🥇", "🥈", "🥉"];
    var com = r.filter(function (x) { return x.pts > 0; });
    var h = '<div class="form-titulo"><i class="fa-solid fa-trophy"></i> ' +
        (sem ? 'Ranking da semana <small class="conq-cont">' + fmtData(ini).slice(0, 5) + ' a ' + fmtData(addDias(ini, 6)).slice(0, 5) + '</small>'
             : 'Ranking de ' + nomeMes(mesAtual())) + '</div>' +
        '<div class="rank-abas"><button type="button" class="' + (sem ? "on" : "") + '" onclick="setRankModo(\'semana\')">Semana</button>' +
        '<button type="button" class="' + (sem ? "" : "on") + '" onclick="setRankModo(\'mes\')">Mês</button></div>';

    if (com.length) {
        var ordemPod = com.length >= 3 ? [1, 0, 2] : com.length === 2 ? [1, 0] : [0];
        h += '<div class="podio">' + ordemPod.map(function (i) {
            var x = com[i];
            return '<div class="pod pos' + (i + 1) + '" onclick="abrirConquistas(' + x.u.id + ')">' +
                (i === 0 ? '<span class="pod-coroa">👑</span>' : '') +
                avatarHTML(x.u, "pod-av") + '<b>' + esc(x.u.nome) + '</b><small>' + x.pts + ' pts</small>' +
                '<div class="pod-bloco">' + medalhas[i] + '</div></div>';
        }).join("") + '</div>';
    } else {
        h += '<p class="dica" style="margin:0 0 10px">Ninguém pontuou ' + (sem ? "nesta semana" : "neste mês") + ' ainda. Finalize uma OS para abrir a disputa!</p>';
    }

    h += r.map(function (x, i) {
        var pos = x.pts > 0 && i < 3 ? medalhas[i] : (i + 1) + "º";
        return '<div class="rank-linha' + (x.u.id === sessao ? " eu" : "") + '" onclick="abrirConquistas(' + x.u.id + ')">' +
            '<span class="rk-pos">' + pos + '</span>' + avatarHTML(x.u, "rk-av") +
            '<div class="rk-tx"><b>' + esc(x.u.nome) + (x.u.id === sessao ? " (você)" : "") + '</b>' +
            '<small>' + x.n + (x.n === 1 ? " OS finalizada" : " OS finalizadas") +
            (x.pen ? ' · <span class="rk-pen">−' + x.pen + ' por atraso</span>' : '') + '</small></div>' +
            '<span class="rk-pts">' + x.pts + '<small>pts</small></span></div>';
    }).join("");

    if (sem) {
        var antIni = addDias(ini, -7), venc = vencedoresSemana(antIni);
        if (venc.length) h += '<p class="dica" style="margin:12px 0 0">👑 Campeão da semana passada: <b>' +
            venc.map(function (x) { return esc(x.u.nome); }).join(", ") + '</b> (' + venc[0].pts + ' pts)</p>';
        h += '<p class="dica" style="margin:8px 0 0">O ranking recomeça toda segunda-feira. Quem termina a semana em 1º lugar ganha <b>1 ponto de semana vencida</b>, que conta para as conquistas lendárias.</p>';
        var eu = user();
        if (eu && eu.papel === "tecnico") {
            var ns = statsTec(eu.id).semanas;
            h += '<p class="dica" style="margin:8px 0 0">🏆 Semanas vencidas por você: <b>' + ns + '</b></p>';
        }
    } else {
        var ant = rankingMes(mesAnterior()).filter(function (x) { return x.pts > 0; })[0];
        if (ant) h += '<p class="dica" style="margin:12px 0 0">👑 Técnico do mês passado: <b>' + esc(ant.u.nome) + '</b> (' + ant.pts + ' pts)</p>';
    }
    h += '<p class="dica" style="margin:8px 0 0">Pontos: 10 por OS finalizada · +5 no prazo · +3 fotos de antes e depois · +2 relatório · +5 elogio do líder. <b>Atraso tira 2 pontos por dia</b> (até 10 por OS), mesmo com a OS ainda aberta. Toque em alguém para ver as conquistas.</p>';
    box.innerHTML = h;
}

/* ----- Conquistas ----- */
var CONQ_VERSAO = 3;   // sobe quando entram conquistas novas (o que já foi merecido entra sem festa)

var CONQ_TIER = {
    1: { n: "Bronze", xp: 5 },
    2: { n: "Prata",  xp: 10 },
    3: { n: "Ouro",   xp: 20 },
    4: { n: "Platina", xp: 40 }
};

var CONQ_NIVEIS = [
    { x: 0,    n: "Aprendiz" },
    { x: 15,   n: "Ajudante" },
    { x: 40,   n: "Técnico" },
    { x: 80,   n: "Técnico Pleno" },
    { x: 140,  n: "Técnico Sênior" },
    { x: 220,  n: "Especialista" },
    { x: 340,  n: "Mestre" },
    { x: 500,  n: "Mestre da Manutenção" },
    { x: 750,  n: "Lenda" },
    { x: 1000, n: "Imortal" }
];

var CONQ_CATS = [
    { id: "vol",  n: "Volume de serviço",       ic: "fa-wrench" },
    { id: "pra",  n: "Prazo e agilidade",       ic: "fa-clock" },
    { id: "qua",  n: "Qualidade e registro",    ic: "fa-camera" },
    { id: "ver",  n: "Versatilidade",           ic: "fa-shapes" },
    { id: "con",  n: "Constância",              ic: "fa-fire" },
    { id: "eqp",  n: "Reconhecimento e equipe", ic: "fa-star" },
    { id: "sec",  n: "Secretas",                ic: "fa-user-secret" }
];

function cq(id, cat, tier, n, d, ic, cor, meta, campo, sec) {
    return { id: id, cat: cat, tier: tier, n: n, d: d, ic: ic, cor: cor, meta: meta, sec: !!sec,
             v: function (s) { return typeof campo === "function" ? campo(s) : s[campo]; } };
}

var CONQUISTAS = [
    /* ---- Volume de serviço ---- */
    cq("primeira", "vol", 1, "Primeira OS",           "Finalize a sua primeira OS",                  "fa-flag-checkered", "#43A047", 1,   "total"),
    cq("dez",      "vol", 1, "Pegando o ritmo",       "10 OS finalizadas",                           "fa-bolt",           "#1E88E5", 10,  "total"),
    cq("v25",      "vol", 2, "Em campo",              "25 OS finalizadas",                           "fa-person-running", "#00897B", 25,  "total"),
    cq("cinq",     "vol", 2, "Veterano",              "50 OS finalizadas",                           "fa-medal",          "#8E24AA", 50,  "total"),
    cq("cem",      "vol", 3, "Lenda da Manutenção",   "100 OS finalizadas",                          "fa-crown",          "#F9A825", 100, "total"),
    cq("v250",     "vol", 4, "Máquina de OS",         "250 OS finalizadas",                          "fa-gears",          "#00ACC1", 250, "total"),
    cq("v500",     "vol", 4, "Patrimônio da fábrica", "500 OS finalizadas",                          "fa-industry",       "#5E35B1", 500, "total"),
    cq("mes10",    "vol", 1, "Mês de peso",           "Finalize 10 OS em um mesmo mês",              "fa-calendar-day",   "#1E88E5", 10,  "melhorMes"),
    cq("mes20",    "vol", 2, "Mês de ouro",           "Finalize 20 OS em um mesmo mês",              "fa-calendar-week",  "#F9A825", 20,  "melhorMes"),
    cq("mes30",    "vol", 3, "Mês lendário",          "Finalize 30 OS em um mesmo mês",              "fa-fire-flame-curved", "#E53935", 30, "melhorMes"),
    cq("dia3",     "vol", 1, "Dia cheio",             "Finalize 3 OS no mesmo dia",                  "fa-list-check",     "#3949AB", 3,   "maxDia"),
    cq("dia5",     "vol", 2, "Maratonista",           "Finalize 5 OS no mesmo dia",                  "fa-stopwatch",      "#EF6C00", 5,   "maxDia"),
    cq("pts100",   "vol", 1, "Pontuador",             "Some 100 pontos no total",                    "fa-coins",          "#FBC02D", 100,  "pts"),
    cq("pts500",   "vol", 2, "Colecionador de pontos","Some 500 pontos no total",                    "fa-sack-dollar",    "#F9A825", 500,  "pts"),
    cq("pts1500",  "vol", 3, "Banco de pontos",       "Some 1.500 pontos no total",                  "fa-vault",          "#8E24AA", 1500, "pts"),
    cq("pts5000",  "vol", 4, "Milionário da oficina", "Some 5.000 pontos no total",                  "fa-gem",            "#00ACC1", 5000, "pts"),

    /* ---- Prazo e agilidade ---- */
    cq("pont",     "pra", 1, "Pontual",               "5 OS designadas seguidas entregues no prazo", "fa-clock",          "#00897B", 5,   "seq"),
    cq("seq10",    "pra", 2, "Relógio suíço",         "10 OS designadas seguidas no prazo",          "fa-hourglass-end",  "#00796B", 10,  "seq"),
    cq("seq20",    "pra", 3, "Sem atraso",            "20 OS designadas seguidas no prazo",          "fa-shield-halved",  "#2E7D32", 20,  "seq"),
    cq("seq40",    "pra", 4, "Hora certa",            "40 OS designadas seguidas no prazo",          "fa-business-time",  "#00ACC1", 40,  "seq"),
    cq("p25",      "pra", 2, "Palavra dada",          "25 OS entregues no prazo (no total)",         "fa-handshake",      "#43A047", 25,  "prazoTot"),
    cq("p100",     "pra", 3, "Confiável",             "100 OS entregues no prazo (no total)",        "fa-circle-check",   "#1B5E20", 100, "prazoTot"),
    cq("mes",      "pra", 2, "Mês perfeito",          "Um mês com 3 OS designadas ou mais, todas no prazo", "fa-calendar-check", "#D81B60", 1, "mesesPerf"),
    cq("perf3",    "pra", 3, "Trimestre perfeito",    "3 meses perfeitos (3 OS ou mais, todas no prazo)", "fa-award",    "#AD1457", 3,   "mesesPerf"),
    cq("perf6",    "pra", 4, "Semestre de ouro",      "6 meses perfeitos (3 OS ou mais, todas no prazo)", "fa-trophy",   "#F9A825", 6,   "mesesPerf"),
    cq("ad5",      "pra", 1, "Adiantado",             "Entregue 5 OS designadas antes do prazo",     "fa-forward",        "#3949AB", 5,   "adiant"),
    cq("ad25",     "pra", 2, "Sempre na frente",      "Entregue 25 OS designadas antes do prazo",    "fa-angles-right",   "#283593", 25,  "adiant"),
    cq("rap",      "pra", 1, "Rápido no gatilho",     "Aceite 5 OS no mesmo dia em que foram abertas", "fa-hand-point-right", "#3949AB", 5, "rapido"),
    cq("rap25",    "pra", 2, "Reflexo rápido",        "Aceite 25 OS no mesmo dia em que foram abertas", "fa-bolt-lightning", "#5E35B1", 25, "rapido"),
    cq("res10",    "pra", 2, "Resolvedor",            "Aceite e finalize a OS no mesmo dia, 10 vezes", "fa-check-double", "#00897B", 10,  "resolvido"),

    /* ---- Qualidade e registro ---- */
    cq("doc",      "qua", 1, "Documentador",          "10 OS com fotos de antes e depois",           "fa-camera",         "#EF6C00", 10,  "docs"),
    cq("doc50",    "qua", 2, "Fotógrafo",             "50 OS com fotos de antes e depois",           "fa-camera-retro",   "#E65100", 50,  "docs"),
    cq("doc150",   "qua", 3, "Arquivo vivo",          "150 OS com fotos de antes e depois",          "fa-images",         "#BF360C", 150, "docs"),
    cq("fot100",   "qua", 2, "Álbum da fábrica",      "Envie 100 fotos em OS",                       "fa-photo-film",     "#EF6C00", 100, "fotos"),
    cq("fot400",   "qua", 3, "Acervo fotográfico",    "Envie 400 fotos em OS",                       "fa-panorama",       "#D84315", 400, "fotos"),
    cq("rel10",    "qua", 1, "Bom de relatório",      "Preencha o relatório em 10 OS designadas",    "fa-file-pen",       "#6D4C41", 10,  "rels"),
    cq("rel50",    "qua", 2, "Relator oficial",       "Preencha o relatório em 50 OS designadas",    "fa-file-lines",     "#4E342E", 50,  "rels"),
    cq("mao",      "qua", 1, "Mão na massa",          "Lance materiais em 10 OS",                    "fa-screwdriver-wrench", "#6D4C41", 10, "mat"),
    cq("mat50",    "qua", 2, "Caixa de ferramentas cheia", "Lance materiais em 50 OS",               "fa-toolbox",        "#5D4037", 50,  "mat"),
    cq("est10",    "qua", 1, "Estoque em dia",        "Use peças do estoque em 10 OS",               "fa-boxes-stacked",  "#00838F", 10,  "estq"),
    cq("est50",    "qua", 2, "Cliente do almoxarifado","Use peças do estoque em 50 OS",              "fa-warehouse",      "#006064", 50,  "estq"),
    cq("im5",      "qua", 2, "OS impecável",          "5 OS designadas completas: no prazo, com fotos, relatório e materiais", "fa-clipboard-check", "#2E7D32", 5, "impec"),
    cq("im25",     "qua", 3, "Padrão ouro",           "25 OS designadas completas",                  "fa-star-half-stroke","#F9A825", 25, "impec"),
    cq("im75",     "qua", 4, "Perfeccionista",        "75 OS designadas completas",                  "fa-certificate",    "#00ACC1", 75,  "impec"),

    /* ---- Versatilidade ---- */
    cq("tipos",    "ver", 2, "Faz-tudo",              "Finalize OS dos 4 tipos: corretiva, preventiva, preditiva e melhoria", "fa-shapes", "#7B1FA2", 4, "tipos"),
    cq("corr10",   "ver", 1, "Bombeiro",              "Finalize 10 OS corretivas",                   "fa-fire-extinguisher","#E53935", 10, "corr"),
    cq("corr50",   "ver", 2, "Caçador de pane",       "Finalize 50 OS corretivas",                   "fa-screwdriver",    "#C62828", 50,  "corr"),
    cq("prev10",   "ver", 1, "Cuidador",              "Finalize 10 OS preventivas",                  "fa-oil-can",        "#1E88E5", 10,  "prev"),
    cq("prev50",   "ver", 2, "Guardião das máquinas", "Finalize 50 OS preventivas",                  "fa-shield",         "#1565C0", 50,  "prev"),
    cq("pred10",   "ver", 1, "Olho clínico",          "Finalize 10 OS preditivas",                   "fa-magnifying-glass-chart", "#00897B", 10, "pred"),
    cq("pred25",   "ver", 2, "Vidente de falhas",     "Finalize 25 OS preditivas",                   "fa-eye",            "#00695C", 25,  "pred"),
    cq("mel3",     "ver", 1, "Ideia na prática",      "Finalize 3 melhorias",                        "fa-lightbulb",      "#F9A825", 3,   "mel"),
    cq("mel15",    "ver", 3, "Inovador",              "Finalize 15 melhorias",                       "fa-rocket",         "#8E24AA", 15,  "mel"),
    cq("urg5",     "ver", 1, "Sob pressão",           "Finalize 5 OS urgentes",                      "fa-triangle-exclamation", "#E53935", 5, "urg"),
    cq("urg25",    "ver", 3, "Herói da urgência",     "Finalize 25 OS urgentes",                     "fa-kit-medical",    "#B71C1C", 25,  "urg"),
    cq("set3",     "ver", 1, "Conhece a fábrica",     "Atenda OS de 3 setores diferentes",           "fa-map-location-dot","#3949AB", 3,  "setores"),
    cq("set5",     "ver", 2, "Cartógrafo",            "Atenda OS de 5 setores diferentes",           "fa-map",            "#283593", 5,   "setores"),
    cq("set8",     "ver", 3, "Dono do pedaço",        "Atenda OS de 8 setores diferentes",           "fa-earth-americas", "#1A237E", 8,   "setores"),
    cq("cam5",     "ver", 1, "Iniciativa",            "Registre 5 serviços por conta própria",       "fa-hand-fist",      "#EF6C00", 5,   "campo"),
    cq("cam25",    "ver", 2, "Mão própria",           "Registre 25 serviços por conta própria",      "fa-hand",           "#E65100", 25,  "campo"),
    cq("cam75",    "ver", 3, "Faro de problema",      "Registre 75 serviços por conta própria",      "fa-binoculars",     "#BF360C", 75,  "campo"),

    /* ---- Constância ---- */
    cq("dias3",    "con", 1, "Três na linha",         "Finalize OS em 3 dias úteis seguidos",        "fa-link",           "#43A047", 3,   "seqDias"),
    cq("dias5",    "con", 2, "Semana cheia",          "Finalize OS em 5 dias úteis seguidos",        "fa-calendar-week",  "#2E7D32", 5,   "seqDias"),
    cq("dias10",   "con", 3, "Duas semanas de fogo",  "Finalize OS em 10 dias úteis seguidos",       "fa-fire",           "#EF6C00", 10,  "seqDias"),
    cq("dias20",   "con", 4, "Mês sem parar",         "Finalize OS em 20 dias úteis seguidos",       "fa-fire-flame-curved", "#D84315", 20, "seqDias"),
    cq("ativo20",  "con", 1, "Presença",              "Finalize OS em 20 dias diferentes",           "fa-user-check",     "#1E88E5", 20,  "dias"),
    cq("ativo50",  "con", 2, "Peça da engrenagem",    "Finalize OS em 50 dias diferentes",           "fa-gear",           "#1565C0", 50,  "dias"),
    cq("ativo150", "con", 3, "Alicerce da equipe",    "Finalize OS em 150 dias diferentes",          "fa-building-columns","#0D47A1", 150, "dias"),
    cq("fds3",     "con", 2, "Plantão",               "Finalize OS em fim de semana, 3 vezes",       "fa-moon",           "#5E35B1", 3,   "fimSem"),
    cq("fds10",    "con", 3, "Sempre de prontidão",   "Finalize OS em fim de semana, 10 vezes",      "fa-tower-broadcast","#4527A0", 10,  "fimSem"),

    /* ---- Reconhecimento e equipe ---- */
    cq("elogio",   "eqp", 1, "Reconhecido",           "Receba um elogio do líder",                   "fa-star",           "#FBC02D", 1,   "elogios"),
    cq("estrela",  "eqp", 2, "Queridinho do líder",   "Receba 5 elogios do líder",                   "fa-heart",          "#E53935", 5,   "elogios"),
    cq("elo10",    "eqp", 3, "Ídolo da equipe",       "Receba 10 elogios do líder",                  "fa-hands-clapping", "#D81B60", 10,  "elogios"),
    cq("elo25",    "eqp", 4, "Unanimidade",           "Receba 25 elogios do líder",                  "fa-face-grin-stars","#F9A825", 25,  "elogios"),
    cq("tit1",     "eqp", 3, "Técnico do mês",        "Termine um mês em 1º lugar no ranking",       "fa-crown",          "#F9A825", 1,   "titulos"),
    cq("tit3",     "eqp", 4, "Tricampeão",            "Termine 3 meses em 1º lugar no ranking",      "fa-trophy",         "#00ACC1", 3,   "titulos"),
    cq("sem1",     "eqp", 2, "Rei da semana",         "Termine uma semana (seg a dom) em 1º lugar no ranking",  "fa-chess-king",   "#F9A825", 1,  "semanas"),
    cq("sem5",     "eqp", 3, "Dinastia",              "Venha em 1º lugar em 5 semanas",              "fa-chess-rook",     "#EF6C00", 5,   "semanas"),
    cq("sem10",    "eqp", 4, "Imbatível",             "Venha em 1º lugar em 10 semanas",             "fa-dragon",         "#D81B60", 10,  "semanas"),
    cq("sem25",    "eqp", 4, "Lenda viva",            "Venha em 1º lugar em 25 semanas",             "fa-hat-wizard",     "#5E35B1", 25,  "semanas"),
    cq("sem52",    "eqp", 4, "Imortal da fábrica",    "Venha em 1º lugar em 52 semanas",             "fa-infinity",       "#00ACC1", 52,  "semanas"),
    cq("comp1",    "eqp", 1, "Pedido feito",          "Faça uma solicitação de compra",              "fa-cart-shopping",  "#3949AB", 1,   "compras"),
    cq("comp10",   "eqp", 2, "Olho no estoque",       "Faça 10 solicitações de compra",              "fa-cart-flatbed",   "#283593", 10,  "compras"),
    cq("perfil",   "eqp", 1, "Crachá completo",       "Coloque a sua foto e a data de nascimento no perfil", "fa-id-badge", "#00897B", 1,  "perfil"),

    /* ---- Secretas ---- */
    cq("trator",   "sec", 3, "Trator",                "Finalize 8 OS no mesmo dia",                  "fa-tractor",        "#6D4C41", 8,   "maxDia", true),
    cq("elomes",   "sec", 3, "Estrela do mês",        "Receba 3 elogios do líder no mesmo mês",      "fa-wand-magic-sparkles", "#FBC02D", 3, "elogMes", true),
    cq("domingo",  "sec", 2, "Domingo de dedicação",  "Finalize uma OS em um domingo",               "fa-sun",            "#F9A825", 1,   "dom", true),
    cq("virada",   "sec", 2, "Virada de ano",         "Finalize uma OS em 31/12 ou 01/01",           "fa-champagne-glasses","#8E24AA", 1, "virada", true),
    cq("trab",     "sec", 2, "Dia do Trabalhador",    "Finalize uma OS em 1º de maio",               "fa-helmet-safety",  "#EF6C00", 1,   "trab", true)
];

/* ----- Nível (a soma dos XP das conquistas feitas) ----- */
function conqGanhas(s) {
    return CONQUISTAS.filter(function (c) { return c.v(s) >= c.meta; });
}

function conqXP(s) {
    var t = 0;
    conqGanhas(s).forEach(function (c) { t += CONQ_TIER[c.tier].xp; });
    return t;
}

function conqNivel(xp) {
    var i = 0;
    for (var k = 0; k < CONQ_NIVEIS.length; k++) { if (xp >= CONQ_NIVEIS[k].x) i = k; }
    var atual = CONQ_NIVEIS[i], prox = CONQ_NIVEIS[i + 1] || null;
    return {
        i: i, num: i + 1, nome: atual.n, xp: xp, prox: prox,
        pct: prox ? Math.round((xp - atual.x) * 100 / (prox.x - atual.x)) : 100
    };
}

function nivelHTML(s) {
    var nv = conqNivel(conqXP(s));
    return '<div class="conq-nivel"><div class="conq-nivel-topo"><b>Nível ' + nv.num + ' · ' + esc(nv.nome) + '</b><small>' + nv.xp + ' XP</small></div>' +
        '<div class="conq-barra xp"><i style="width:' + nv.pct + '%"></i></div>' +
        '<small>' + (nv.prox ? 'Faltam ' + (nv.prox.x - nv.xp) + ' XP para ' + esc(nv.prox.n) : 'Nível máximo alcançado! 🏆') + '</small></div>';
}

/* ----- Estatísticas de um técnico (tudo calculado das OS) ----- */
function proxUtil(s) {
    var d = dataDe(s);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return iso(d);
}

function statsTec(tecId) {
    function chave(o) { return o.concluida + "|" + ("000000" + o.id).slice(-6); }
    var fin = osDoTec(tecId).sort(function (a, b) { return chave(a).localeCompare(chave(b)); });
    var s = {
        total: fin.length, docs: 0, mat: 0, rapido: 0, elogios: 0, seq: 0, perfeito: false,
        pts: 0, fotos: 0, rels: 0, estq: 0, impec: 0, prazoTot: 0, adiant: 0, resolvido: 0,
        corr: 0, prev: 0, pred: 0, mel: 0, tipos: 0, urg: 0, setores: 0, campo: 0,
        dias: 0, seqDias: 0, maxDia: 0, melhorMes: 0, fimSem: 0, dom: 0, virada: 0, trab: 0,
        mesesPerf: 0, titulos: 0, semanas: 0, elogMes: 0, compras: 0, perfil: 0
    };
    var corrente = 0, meses = {}, tiposSet = {}, setoresSet = {}, diasSet = {}, porDia = {}, porMes = {}, elogiosMes = {};

    fin.forEach(function (o) {
        var c = o.concluida, m = mesDe(c), dow = dataDe(c).getDay(), md = String(c).slice(5);
        var prazo = noPrazo(o), rel = (o.rel || "").trim();
        var tipo = String(o.tipo || "").toLowerCase();

        s.pts += pontosOS(o);
        if (temFotos(o)) s.docs++;
        if (o.fotos) s.fotos += (o.fotos.antes ? o.fotos.antes.length : 0) + (o.fotos.depois ? o.fotos.depois.length : 0);
        if (o.itens && o.itens.length) s.mat++;
        if (o.itens && o.itens.some(function (i) { return i.estId; })) s.estq++;
        if (o.elogio) { s.elogios++; elogiosMes[m] = (elogiosMes[m] || 0) + 1; }

        porDia[c] = (porDia[c] || 0) + 1;
        porMes[m] = (porMes[m] || 0) + 1;
        diasSet[c] = true;
        if (o.setor) setoresSet[o.setor] = true;
        if (dow === 0) s.dom++;
        if (dow === 0 || dow === 6) s.fimSem++;
        if (md === "12-31" || md === "01-01") s.virada++;
        if (md === "05-01") s.trab++;

        if (tipo.indexOf("corret") === 0) { s.corr++; tiposSet.corr = true; }
        else if (tipo.indexOf("prevent") === 0) { s.prev++; tiposSet.prev = true; }
        else if (tipo.indexOf("predit") === 0) { s.pred++; tiposSet.pred = true; }
        else if (tipo.indexOf("melhor") === 0) { s.mel++; tiposSet.mel = true; }

        if (o.origem === "campo") s.campo++;

        if (o.origem === "designada") {
            if (o.prior === "urgente") s.urg++;
            if (rel) s.rels++;
            if (o.aceitaEm && o.criada && o.aceitaEm === o.criada) s.rapido++;
            if (o.aceitaEm && o.aceitaEm === c) s.resolvido++;
            if (o.data && c < o.data) s.adiant++;
            if (prazo) { s.prazoTot++; corrente++; if (corrente > s.seq) s.seq = corrente; } else { corrente = 0; }
            if (prazo && rel && temFotos(o) && o.itens && o.itens.length) s.impec++;
            if (!meses[m]) meses[m] = { n: 0, ok: 0 };
            meses[m].n++;
            if (prazo) meses[m].ok++;
        }
    });

    for (var k in meses) { if (meses[k].n >= 3 && meses[k].n === meses[k].ok) s.mesesPerf++; }
    s.perfeito = s.mesesPerf > 0;
    s.tipos = Object.keys(tiposSet).length;
    s.setores = Object.keys(setoresSet).length;
    s.maxDia = Math.max.apply(null, [0].concat(Object.keys(porDia).map(function (d) { return porDia[d]; })));
    s.melhorMes = Math.max.apply(null, [0].concat(Object.keys(porMes).map(function (d) { return porMes[d]; })));
    s.elogMes = Math.max.apply(null, [0].concat(Object.keys(elogiosMes).map(function (d) { return elogiosMes[d]; })));

    // dias seguidos (úteis): de sexta para segunda também conta como seguido
    var dias = Object.keys(diasSet).sort(), run = 0, ant = "";
    s.dias = dias.length;
    dias.forEach(function (d) {
        var dif = ant ? Math.round((dataDe(d) - dataDe(ant)) / 86400000) : 0;
        run = (ant && (dif === 1 || d === proxUtil(ant))) ? run + 1 : 1;
        if (run > s.seqDias) s.seqDias = run;
        ant = d;
    });

    // meses (já encerrados) em que ficou em 1º lugar no ranking
    Object.keys(porMes).forEach(function (m) {
        if (m >= mesAtual()) return;
        var topo = rankingMes(m)[0];
        if (topo && topo.pts > 0 && topo.u.id === tecId) s.titulos++;
    });

    // semanas (já encerradas) em que ficou em 1º lugar no ranking
    var semAtual = semanaIni(hoje()), semVistas = {};
    fin.forEach(function (o) {
        var ini = semanaIni(o.concluida);
        if (ini >= semAtual || semVistas[ini]) return;
        semVistas[ini] = true;
        if (vencedoresSemana(ini).some(function (x) { return x.u.id === tecId; })) s.semanas++;
    });

    s.compras = compras.filter(function (x) { return x.por === tecId && (x.em || 0) >= ((empresa && empresa.zeroTs) || 0); }).length;
    var u = userPorId(tecId);
    s.perfil = u && u.foto && u.nasc ? 1 : 0;
    return s;
}

/* Próximos objetivos: as conquistas abertas mais perto de sair */
function proximosObjetivos(s, qtd) {
    return CONQUISTAS.filter(function (c) { return !c.sec && c.v(s) < c.meta; })
        .sort(function (a, b) {
            return (b.v(s) / b.meta) - (a.v(s) / a.meta) || a.meta - b.meta;
        }).slice(0, qtd);
}

function conqItemHTML(c, s, u) {
    var v = Math.min(c.v(s), c.meta), ok = v >= c.meta;
    var escondida = c.sec && !ok;
    var t = CONQ_TIER[c.tier];
    var quando = ok && u && u.conq && u.conq[c.id] ? "Conquistada em " + fmtData(u.conq[c.id]) : "Conquistada ✔";
    return '<div class="conq-item' + (ok ? " ok" : "") + '" style="--cq:' + c.cor + '">' +
        '<span class="conq-ic"><i class="fa-solid ' + (ok ? c.ic : escondida ? "fa-question" : "fa-lock") + '"></i></span>' +
        '<div class="conq-tx"><b>' + (escondida ? "Conquista secreta" : esc(c.n)) +
        ' <span class="conq-tier t' + c.tier + '">' + t.n + ' · +' + t.xp + ' XP</span></b>' +
        '<small>' + (escondida ? "Continue trabalhando para descobrir" : esc(c.d)) + '</small>' +
        (ok ? '<em>' + quando + '</em>'
            : escondida ? ""
            : '<div class="conq-barra"><i style="width:' + Math.round(v * 100 / c.meta) + '%"></i></div><em>' + v + ' de ' + c.meta + '</em>') +
        '</div></div>';
}

function renderConqCard() {
    var box = $("conqCard"), u = user();
    if (!box) return;
    if (!u || u.papel !== "tecnico") { box.style.display = "none"; return; }
    box.style.display = "";
    var s = statsTec(u.id), ganhas = conqGanhas(s);
    var prox = proximosObjetivos(s, 3);
    var mini = ganhas.slice().sort(function (a, b) { return b.tier - a.tier; }).slice(0, 12).map(function (c) {
        return '<span class="conq-mini" style="--cq:' + c.cor + '" title="' + esc(c.n) + '"><i class="fa-solid ' + c.ic + '"></i></span>';
    }).join("");
    box.innerHTML = '<div class="form-titulo"><i class="fa-solid fa-medal"></i> Minhas conquistas <small class="conq-cont">' + ganhas.length + ' de ' + CONQUISTAS.length + '</small></div>' +
        nivelHTML(s) +
        (prox.length ? '<h4 class="conq-sub">🎯 Próximos objetivos</h4>' + prox.map(function (c) { return conqItemHTML(c, s, u); }).join("") : "") +
        (mini ? '<h4 class="conq-sub">🏅 Suas melhores conquistas</h4><div class="conq-grade">' + mini + '</div>' : "") +
        '<button class="btn-sec cheio" style="margin-top:12px" onclick="abrirConquistas(' + u.id + ')">Ver todas as conquistas</button>';
}

function abrirConquistas(id) {
    var u = userPorId(id);
    if (!u || u.papel !== "tecnico") return;
    var s = statsTec(id), mes = pontosDoMes(id, mesAtual()), ganhas = conqGanhas(s);
    var cats = CONQ_CATS.map(function (cat, idx) {
        var lista = CONQUISTAS.filter(function (c) { return c.cat === cat.id; });
        var feitas = lista.filter(function (c) { return c.v(s) >= c.meta; }).length;
        return '<details class="conq-cat"' + (idx === 0 ? " open" : "") + '><summary><i class="fa-solid ' + cat.ic + '"></i> ' + cat.n +
            '<small>' + feitas + '/' + lista.length + '</small></summary>' +
            lista.map(function (c) { return conqItemHTML(c, s, u); }).join("") + '</details>';
    }).join("");
    var prox = proximosObjetivos(s, 3);
    var h = '<div class="sheet-alca"></div><h2>🏅 ' + esc(u.nome) + '</h2>' +
        '<div class="est-resumo"><div><b>' + mes.pts + '</b><small>pontos no mês</small></div>' +
        '<div><b>' + s.total + '</b><small>OS finalizadas</small></div>' +
        '<div><b>' + ganhas.length + '/' + CONQUISTAS.length + '</b><small>conquistas</small></div></div>' +
        nivelHTML(s) +
        (prox.length ? '<h4 class="conq-sub">🎯 Próximos objetivos</h4>' + prox.map(function (c) { return conqItemHTML(c, s, u); }).join("") : "") +
        '<h4 class="conq-sub">📚 Todas as conquistas</h4>' + cats +
        '<div class="sheet-acoes um" style="margin-top:6px"><button class="btn-sec" onclick="fecharOS()">Fechar</button></div>';
    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

var conqFila = [];
var conqSubiu = "";

function conferirConquistas() {
    var u = user();
    if (!u || u.papel !== "tecnico") return;
    if (viewAtual === "nova" || $("dlgConf") || $("conqModal") || $("sheet").classList.contains("on")) return;
    var s = statsTec(u.id);
    var ganhas = conqGanhas(s);
    if (!u.conq) {   // primeira vez: registra o que já tinha, sem comemorar o passado
        u.conq = {};
        ganhas.forEach(function (c) { u.conq[c.id] = hoje(); });
        u.conqV = CONQ_VERSAO;
        salvar();
        return;
    }
    if ((u.conqV || 0) < CONQ_VERSAO) {   // lista nova de conquistas: o que já era merecido entra sem festa
        ganhas.forEach(function (c) { if (!u.conq[c.id]) u.conq[c.id] = hoje(); });
        u.conqV = CONQ_VERSAO;
        salvar();
        renderTudo();
        return;
    }
    var novas = ganhas.filter(function (c) { return !u.conq[c.id]; });
    if (!novas.length) return;
    var xpDepois = conqXP(s), xpGanho = 0;
    novas.forEach(function (c) { xpGanho += CONQ_TIER[c.tier].xp; });
    var antes = conqNivel(xpDepois - xpGanho), depois = conqNivel(xpDepois);
    if (depois.i > antes.i) conqSubiu = depois.nome;
    novas.forEach(function (c) { u.conq[c.id] = hoje(); conqFila.push(c); });
    salvar();
    renderTudo();
    mostrarConquista();
}

function mostrarConquista() {
    if ($("conqModal") || !conqFila.length) return;
    var c = conqFila.shift(), t = CONQ_TIER[c.tier];
    var ultima = !conqFila.length;
    var subiu = ultima && conqSubiu ? '<p class="conq-subiu">🆙 Você subiu de nível: <b>' + esc(conqSubiu) + '</b></p>' : "";
    if (ultima) conqSubiu = "";
    var d = document.createElement("div");
    d.id = "conqModal";
    d.className = "dlg-fundo";
    d.innerHTML = '<div class="dlg conq-dlg" style="--cq:' + c.cor + '">' + confeteHTML() +
        '<div class="conq-selo"><i class="fa-solid ' + c.ic + '"></i></div>' +
        '<small class="conq-nova">Nova conquista!</small><h3>' + esc(c.n) + '</h3><p>' + esc(c.d) + '</p>' +
        '<span class="conq-tier t' + c.tier + '">' + t.n + ' · +' + t.xp + ' XP</span>' + subiu +
        '<div class="dlg-bt um"><button type="button" class="dlg-sim">Legal! 🎉</button></div></div>';
    document.body.appendChild(d);
    d.querySelector(".dlg-sim").onclick = function () {
        if (d.parentNode) d.parentNode.removeChild(d);
        setTimeout(mostrarConquista, 250);
    };
    requestAnimationFrame(function () { d.classList.add("on"); });
}

/* ----- Elogio do líder ----- */
var ELOGIOS = ["Ótimo trabalho! 👏", "Muito caprichoso 🔧", "Resolveu rápido ⚡", "Excelente documentação 📸", "Valeu pela ajuda 🤝"];

function elogioHTML(o, adm) {
    if (o.status !== "final") return "";
    var t = userPorId(o.tecId);
    if (!t || t.papel !== "tecnico") return "";
    if (o.elogio) {
        return '<div class="elogio"><div class="elogio-ic"><i class="fa-solid fa-star"></i></div>' +
            '<div class="elogio-tx"><small>Elogio de ' + esc(nomeDe(o.elogio.de)) + '</small><b>' + esc(o.elogio.msg) + '</b></div>' +
            (adm ? '<button class="elogio-ed" onclick="abrirElogio(' + o.id + ')" aria-label="Alterar elogio"><i class="fa-solid fa-pen"></i></button>' : "") + '</div>';
    }
    return adm ? '<button class="btn-sec cheio elogiar" onclick="abrirElogio(' + o.id + ')"><i class="fa-solid fa-star"></i> Elogiar ' + esc(t.nome) + '</button>' : "";
}

function abrirElogio(id) {
    var o = buscar(id);
    if (!o || !ehAdmin() || o.status !== "final") return;
    var t = userPorId(o.tecId);
    if (!t) return;
    var h = '<div class="sheet-alca"></div><h2>⭐ Elogiar ' + esc(t.nome) + '</h2>' +
        '<p class="dica" style="margin:0 0 10px">OS ' + num(o.id) + ' · ' + esc(o.titulo) + '. O técnico recebe um aviso e ganha pontos no ranking.</p>' +
        '<div class="elogio-chips">' + ELOGIOS.map(function (e, i) { return '<button type="button" onclick="escolherElogio(' + i + ')">' + esc(e) + '</button>'; }).join("") + '</div>' +
        '<label class="campo"><span>Mensagem</span><textarea id="elogioMsg" rows="3" maxlength="140" placeholder="Escreva um recado (opcional)">' + esc(o.elogio ? o.elogio.msg : "") + '</textarea></label>' +
        '<div class="sheet-acoes"><button class="btn-sec" onclick="abrirOS(' + o.id + ')">Cancelar</button>' +
        '<button class="btn-pri" style="margin-top:0" onclick="salvarElogio(' + o.id + ')"><i class="fa-solid fa-star"></i> Enviar</button></div>' +
        (o.elogio ? '<div class="sheet-acoes um" style="margin-top:10px"><button class="btn-perigo" onclick="removerElogio(' + o.id + ')"><i class="fa-solid fa-trash"></i> Remover elogio</button></div>' : "");
    $("sheet").innerHTML = h;
}

function escolherElogio(i) { $("elogioMsg").value = ELOGIOS[i]; }

function salvarElogio(id) {
    var o = buscar(id);
    if (!o || !ehAdmin() || o.status !== "final") return;
    var msg = $("elogioMsg").value.trim() || "Ótimo trabalho!";
    var antes = o.elogio ? o.elogio.msg : null;
    o.elogio = { de: sessao, msg: msg, em: Date.now() };
    if (antes !== msg) {
        avisos.push({ id: Date.now() + "_e" + o.id, para: o.tecId, osId: o.id, em: Date.now(), cor: "amar", ic: "fa-star",
                      t: "⭐ " + nomeDe(sessao) + " elogiou você!", s: msg + " · OS " + num(o.id) });
    }
    salvar();
    abrirOS(id);
    renderTudo();
    toast("Elogio enviado ⭐");
}

function removerElogio(id) {
    var o = buscar(id);
    if (!o || !ehAdmin() || !o.elogio) return;
    pedirConfirmacao({
        ic: "fa-star", titulo: "Remover elogio?", sim: "Sim, remover",
        texto: 'O elogio da <b>OS ' + num(o.id) + '</b> será removido e o técnico perde os pontos dele.'
    }, function () {
        delete o.elogio;
        salvar();
        abrirOS(id);
        renderTudo();
        toast("Elogio removido");
    });
}

function excluirOS(id) {
    if (!ehAdmin()) return;
    var o = buscar(id);
    if (!o) return;
    var rel = o.origem === "campo";
    pedirConfirmacao({
        ic: "fa-trash-can", titulo: rel ? "Excluir relatório?" : "Excluir ordem de serviço?",
        texto: (rel ? 'O relatório' : 'A') + ' <b>OS ' + num(o.id) + '</b> · ' + esc(o.titulo) + ' será apagad' + (rel ? 'o' : 'a') + ', com fotos e materiais. Essa ação não pode ser desfeita.'
    }, function () {
        ordens = ordens.filter(function (x) { return x.id !== Number(id); });
        salvar();
        fecharOS();
        renderTudo();
        toast("OS excluída");
    });
}

/* ==========================================
   ESTOQUE
   O saldo é sempre calculado: quantidade cadastrada
   menos o que foi lançado como item de estoque em OS FINALIZADAS.
   A peça entra na OS ao lançar, mas só sai do saldo quando a OS é
   finalizada; se a OS for excluída, a peça volta sozinha.
========================================== */
function arred(n) { return Math.round(n * 100) / 100; }

function lerNumero(v) {
    var t = String(v == null ? "" : v).trim();
    if (!t) return 0;
    var n = parseFloat(t.replace(/\./g, "").replace(",", "."));
    if (isNaN(n)) n = parseFloat(t);
    if (isNaN(n)) n = parseFloat(t.replace(",", "."));
    return isNaN(n) ? 0 : n;
}

function estItem(id) {
    id = Number(id);
    return estoque.filter(function (e) { return e.id === id; })[0];
}

function consumoEstoque(estId, ignorarOS) {
    var t = 0;
    ordens.forEach(function (o) {
        if (o.id === ignorarOS || o.status !== "final") return;   // só a OS finalizada dá baixa
        (o.itens || []).forEach(function (i) { if (i.estId === estId) t += i.qtd; });
    });
    return arred(t);
}

function saldoEstoque(e) { return arred(e.qtd - consumoEstoque(e.id)); }

// Quanto ainda dá para lançar nesta lista de itens (desconta o que já está nela)
function disponivelEstoque(estId, alvo) {
    var e = estItem(estId);
    if (!e) return 0;
    var osId = alvo === "form" ? (Number($("fId").value) || 0) : Number(alvo);
    var usado = 0;
    (listaItens(alvo) || []).forEach(function (i) { if (i.estId === estId) usado += i.qtd; });
    return arred(e.qtd - consumoEstoque(estId, osId) - usado);
}

function estBaixo(e) {
    // Abaixo do mínimo, mas ainda com saldo (o que está zerado aparece no card próprio)
    var s = saldoEstoque(e);
    return s > 0 && e.min > 0 && s <= e.min;
}

function porNome(a, b) {
    // compara sem estourar quando falta o nome em algum registro
    var na = String((a && a.nome) || "").toLowerCase();
    var nb = String((b && b.nome) || "").toLowerCase();
    return na.localeCompare(nb, "pt-BR");
}

function itemPendente(alvo) {
    var n = $("iNome_" + alvo), c = $("iCx_" + alvo), e = $("iEst_" + alvo);
    return !!((e && e.value) || (n && n.value.trim()) || (c && c.value.trim()));
}

function aoEstoque(alvo) {
    var sel = $("iEst_" + alvo);
    if (!sel) return;
    var man = $("iManual_" + alvo), un = $("iUn_" + alvo), dica = $("iEstDica_" + alvo);
    var e = sel.value ? estItem(sel.value) : null;
    if (e) {
        man.style.display = "none";
        un.value = e.un;
        un.disabled = true;
        dica.innerHTML = '<span class="est-sel-foto">' + estMiniatura(e) + '<span>' + (locTexto(e) ? '📍 ' + esc(locTexto(e)) + (e.caixa ? ' · caixa ' + esc(e.caixa) : '') + '<br>' : (e.caixa ? 'Caixa ' + esc(e.caixa) + '<br>' : '')) +
            'Disponível: ' + fmtQtd(disponivelEstoque(e.id, alvo)) + ' ' + esc(e.un) + '. A baixa no saldo é feita ao lançar a OS.</span></span>';
    } else {
        man.style.display = "";
        un.disabled = false;
        dica.innerHTML = "";
    }
}

/* ----- Tela de Estoque (líder) ----- */
var estFotoTemp = "";     // foto escolhida no formulário de novo item
var estFotoAlvo = null;   // id do item cuja foto está sendo trocada (null = novo item)

var estFiltro = "todos";   // todos | baixo | zerado

function estSaldoZero(e) { return saldoEstoque(e) <= 0; }

function locTexto(e) {
    if (!e.rua) return e.local || "";
    return "Rua " + e.rua + (e.lado ? " · Lado " + (e.lado === "D" ? "direito" : "esquerdo") : "") + (e.nivel ? " · Nível " + e.nivel : "");
}

function setEstFiltro(f) {
    estFiltro = (estFiltro === f) ? "todos" : f;
    renderEstoque();
}

var estCat = "";   // categoria escolhida na lista ("" = todas)

function setEstCat(c) {
    estCat = (estCat === c) ? "" : c;
    renderEstoque();
}

function renderChipsEstoque() {
    var box = $("estCats");
    if (!box) return;
    var usadas = [];
    estoque.forEach(function (e) { if (e.cat && usadas.indexOf(e.cat) === -1) usadas.push(e.cat); });
    usadas.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    if (!usadas.length) { box.innerHTML = ""; box.style.display = "none"; return; }
    box.style.display = "flex";
    box.innerHTML = '<button class="chip ' + (estCat === "" ? "on" : "") + '" onclick="setEstCat(\'\')">Todas</button>' +
        usadas.map(function (c) {
            return '<button class="chip ' + (estCat === c ? "on" : "") + '" onclick="setEstCat(\'' + esc(c).replace(/'/g, "\\'") + '\')">' + esc(c) + '</button>';
        }).join("");
}

// Foto sempre pequena, como ícone; ao tocar, abre ampliada
function estMiniatura(e, ampliar) {
    if (e.foto && ampliar) {
        return '<div class="est-foto zoom" onclick="event.stopPropagation();verFotoEst(' + e.id + ')"><img src="' + esc(e.foto) + '" alt=""></div>';
    }
    return '<div class="est-foto">' + (e.foto ? '<img src="' + esc(e.foto) + '" alt="">' : '<i class="fa-solid fa-box"></i>') + '</div>';
}

function verFotoEst(id) {
    var e = estItem(id);
    if (e && e.foto) verFoto(e.foto);
}

function montarDatalistLocal() {
    var vistos = {}, h = "";
    estoque.forEach(function (e) {
        if (e.local && !vistos[e.local.toLowerCase()]) { vistos[e.local.toLowerCase()] = 1; h += '<option value="' + esc(e.local) + '">'; }
    });
    $("dlLocal").innerHTML = h;
}

function renderEstoque() {
    var box = $("listaEstoque");
    if (!box) return;
    var q = $("estBusca") ? $("estBusca").value.trim().toLowerCase() : "";
    var nz = estoque.filter(estSaldoZero).length;
    var nb = estoque.filter(estBaixo).length;

    function card(f, n, rot, alerta) {
        return '<div class="' + (estFiltro === f ? "on " : "") + (alerta && n ? "alerta" : "") + '" onclick="setEstFiltro(\'' + f + '\')"><b>' + n + '</b><small>' + rot + '</small></div>';
    }
    $("estResumo").innerHTML = card("todos", estoque.length, "Materiais cadastrados", false) +
        (ehAdmin()
            ? card("baixo", nb, "Abaixo do mínimo", true) + card("zerado", nz, "Estoque zerado", true)
            : card("zerado", nz, "Estoque zerado", true));

    renderChipsEstoque();

    var lista = estoque.filter(function (e) {
        if (estFiltro === "baixo" && !estBaixo(e)) return false;
        if (estFiltro === "zerado" && !estSaldoZero(e)) return false;
        if (estCat && (e.cat || "") !== estCat) return false;
        var texto = (e.nome + " " + (e.codigo || "") + " " + (e.cat || "") + " " + (e.desc || "") + " " + (e.caixa || "") + " " + locTexto(e) + " " + locaisDe(e).map(locTexto).join(" "));
        var alvo = semAcento(texto);
        return !q || alvo.indexOf(semAcento(q)) !== -1;
    }).sort(porNome);

    var nomesF = { baixo: "Abaixo do mínimo", zerado: "Estoque zerado" };
    var faixa = estFiltro !== "todos"
        ? '<div class="est-filtro"><span>Mostrando: <b>' + nomesF[estFiltro] + '</b> (' + lista.length + ')</span><a onclick="setEstFiltro(\'' + estFiltro + '\')">Limpar filtro</a></div>' : "";

    box.innerHTML = faixa + (lista.length ? lista.map(function (e) {
        var det = [];
        if (e.cat) det.push(esc(e.cat));
        if (e.codigo) det.push(esc(e.codigo));
        var locais = locaisDe(e);
        if (locais.length > 1) {
            det.push(locais.length + " locais");
        } else {
            var lc = locCurto(locais[0]);
            if (lc) det.push("📍 " + esc(lc));
        }
        if (e.min) det.push("mín. " + fmtQtd(e.min));
        var vermelho = estBaixo(e) || estSaldoZero(e);
        var cp = compraAberta(e.id);
        var extra = cp ? '<span class="tag cs-comp mini">Em compra</span>'
            : (vermelho && podeCompras() ? '<button class="est-sol" onclick="event.stopPropagation();formCompra(' + e.id + ')"><i class="fa-solid fa-cart-plus"></i> Solicitar</button>' : "");
        return '<div class="est-linha" onclick="abrirPeca(' + e.id + ')">' + estMiniatura(e, true) +
               '<div class="info"><b>' + esc(e.nome) + '</b><small>' + (det.join(" · ") || "Sem local informado") + '</small></div>' +
               '<div class="est-dir"><span class="est-saldo' + (vermelho ? ' baixo' : '') + '">' + fmtQtd(saldoEstoque(e)) + ' ' + esc(e.un) + '</span>' + extra + '</div></div>';
    }).join("") : '<div class="vazio" style="padding:18px 0">' + (estoque.length ? "Nenhuma peça neste filtro." : "Nenhuma peça cadastrada. Toque em Nova peça.") + '</div>');
    var nr = reposicaoLista().length;
    if ($("repBadge")) { $("repBadge").textContent = nr || ""; $("repBadge").style.display = nr ? "" : "none"; }
    montarDatalistLocal();
}

function pickEstFoto(id) {
    estFotoAlvo = id;
    $("fileEstFoto").value = "";
    $("fileEstFoto").click();
}

function aoEscolherEstFoto() {
    var f = $("fileEstFoto").files[0];
    if (!f || !ehAdmin()) return;
    comprimir(f, function (url) {
        if (!url) return;
        if (estFotoAlvo) {
            var e = estItem(estFotoAlvo);
            if (!e) return;
            e.foto = url;
            salvar();
            renderEstoque();
            formEstoque(e.id);
        } else {
            estFotoTemp = url;
            formEstoque(null, true);
        }
    });
}

function tirarEstFoto(id) {
    if (id) {
        var e = estItem(id);
        if (!e) return;
        e.foto = "";
        salvar();
        renderEstoque();
        if (viewAtual === "p-peca") { renderPeca(); return; }
        formEstoque(e.id);
    } else {
        estFotoTemp = "";
        formEstoque(null, true);
    }
}

// Histórico: movimentos manuais + saídas por OS concluída
function historicoEstoque(e) { return movimentosDe(e).slice(0, 12); }

function movEstoque(id, tipo) {
    var e = estItem(id);
    if (!e || !ehAdmin()) return;
    var q = lerNumero($("movQtd").value);
    if (!(q > 0)) { toast("Informe a quantidade"); return; }
    if (tipo === "saida" && q > saldoEstoque(e)) { toast("Saída maior que o saldo (" + fmtQtd(saldoEstoque(e)) + " " + e.un + ")"); return; }
    e.qtd = arred(e.qtd + (tipo === "entrada" ? q : -q));

    // o total dos locais acompanha a movimentação (sai do 1º local, entra no 1º local)
    var locais = locaisDe(e);
    if (locais.length) {
        var l0 = locais[0];
        l0.qtd = Math.max(0, arred((Number(l0.qtd) || 0) + (tipo === "entrada" ? q : -q)));
    }

    if (!e.mov) e.mov = [];
    e.mov.push({ t: tipo, qtd: arred(q), em: hoje(), por: sessao, obs: $("movObs").value.trim() });
    if (e.mov.length > 300) e.mov = e.mov.slice(-300);
    salvar();
    renderTudo();
    if (viewAtual === "p-peca" && e) renderPeca(); else fecharOS();
    toast(tipo === "entrada" ? "Entrada registrada ✔" : "Saída registrada ✔");
}

/* ==========================================
   ESTOQUE - CADASTRO DE PEÇAS
   Cada peça tem: nome, código, categoria, unidade, estoque mínimo,
   foto e uma lista de locais (rua, lado, nível, caixa/gaveta e a
   quantidade guardada em cada um). O total do estoque é a soma dos locais.
   ========================================== */

function optUnidade(valor) {
    return String(valor || "un").toUpperCase();
}

// Valor que o select de unidade deve mostrar
function unidadeSel(valor) {
    var v = String(valor || "un");
    return UNIDADES.indexOf(v) !== -1 ? v : "un";
}

function optsRua(sel) {
    var h = '<option value="">—</option>';
    for (var i = 0; i < 26; i++) {
        var L = String.fromCharCode(65 + i);
        h += '<option value="' + L + '"' + (L === sel ? " selected" : "") + ">" + L + "</option>";
    }
    // guarda uma rua que veio de versão antiga (fora de A–Z) para não perder a localização
    if (sel && !/^[A-Z]$/.test(sel)) h += '<option value="' + esc(sel) + '" selected>' + esc(sel) + "</option>";
    return h;
}

function optsLado(sel) {
    return '<option value="">—</option><option value="D"' + (sel === "D" ? " selected" : "") + '>Direito</option>' +
           '<option value="E"' + (sel === "E" ? " selected" : "") + '>Esquerdo</option>';
}

function optsNivel(sel) {
    var h = '<option value="">—</option>';
    for (var i = 1; i <= 15; i++) h += '<option value="' + i + '"' + (String(i) === String(sel) ? " selected" : "") + ">" + i + "</option>";
    // nível fora de 1–15 (versão antiga) continua aparecendo
    if (sel && !(Number(sel) >= 1 && Number(sel) <= 15)) h += '<option value="' + esc(sel) + '" selected>' + esc(sel) + "</option>";
    return h;
}

/* ----- Locais de guarda (uma peça pode ficar em vários lugares) ----- */
function locaisDe(e) { return (e && e.locais) ? e.locais : []; }

function qtdLocais(e) {
    var t = 0;
    locaisDe(e).forEach(function (l) { t += Number(l.qtd) || 0; });
    return arred(t);
}

function locVazio() { return { rua: "", lado: "", nivel: "", caixa: "", qtd: "" }; }

// Texto curto do local: "Rua C · lado direito · nível 4 · caixa 12"
function locCurto(l) {
    if (!l) return "";
    var p = [];
    if (l.rua) p.push("Rua " + l.rua);
    if (l.lado) p.push("lado " + (l.lado === "D" ? "direito" : "esquerdo"));
    if (l.nivel) p.push("nível " + l.nivel);
    if (l.caixa) p.push("caixa " + l.caixa);
    if (p.length) return p.join(" · ");
    return l.local || "";
}

function linhaLocal(i, l) {
    return '<div class="local-linha" data-i="' + i + '" data-lado="' + esc(l.lado || "") + '">' +
        '<span class="local-n">' + (i + 1) + '</span>' +
        '<select class="ll-rua" aria-label="Rua">' + optsRua(l.rua) + '</select>' +
        '<select class="ll-nivel" aria-label="Nível">' + optsNivel(l.nivel) + '</select>' +
        '<input type="text" class="ll-caixa" maxlength="12" placeholder="Nº da caixa" value="' + esc(l.caixa || "") + '" aria-label="Caixa ou gaveta">' +
        '<input type="text" class="ll-qtd" inputmode="decimal" maxlength="8" placeholder="0" value="' + esc(String(l.qtd == null ? "" : l.qtd)) + '" aria-label="Quantidade neste local">' +
        '<button type="button" class="local-x" onclick="rmLocalLinha(this)" aria-label="Remover local">✕</button>' +
    '</div>';
}

// Lê o que está na tela
function lerLocais() {
    var box = $("estLocais");
    if (!box) return [];
    var out = [];
    box.querySelectorAll(".local-linha").forEach(function (ln) {
        var l = {
            rua: ln.querySelector(".ll-rua").value,
            lado: ln.getAttribute("data-lado") || "",   // campo antigo: preservado, sem edição
            nivel: ln.querySelector(".ll-nivel").value,
            caixa: ln.querySelector(".ll-caixa").value.trim(),
            qtd: arred(lerNumero(ln.querySelector(".ll-qtd").value) || 0)
        };
        if (l.rua || l.nivel || l.caixa || l.qtd) out.push(l);
    });
    return out;
}

/* Cada linha sabe qual local salvo ela representa (data-base).
   O saldo continua sendo: o que foi digitado + o que já estava no local. */
function basesLinhas() {
    var box = $("estLocais");
    var out = [];
    if (!box) return out;
    box.querySelectorAll(".local-linha").forEach(function (ln) { out.push(ln.getAttribute("data-base")); });
    return out;
}

function renderLocaisEdicao(locais, bases) {
    var box = $("estLocais");
    if (!box) return;
    var lista = (locais && locais.length) ? locais : [locVazio()];
    box.innerHTML = lista.map(function (l, i) { return linhaLocal(i, l); }).join("");
    box.querySelectorAll(".local-linha").forEach(function (ln, i) {
        ln.setAttribute("data-base", bases && bases[i] != null ? String(bases[i]) : "");
        ln.querySelector(".ll-qtd").addEventListener("input", atualizarTotalPeca);
    });
    atualizarTotalPeca();
}

function totalDigitado() {
    var locais = lerLocais();
    var t = 0;
    locais.forEach(function (l) { t += Number(l.qtd) || 0; });
    return arred(t);
}

function atualizarTotalPeca() {
    var t = totalDigitado();
    var alvo = $("estTotalPeca");
    if (alvo) alvo.textContent = fmtQtd(t);
    var rod = $("estTotalRodape");
    if (rod) rod.textContent = fmtQtd(t) + " " + ($("edEstUn") ? $("edEstUn").value : "");
}

function addLocal() {
    var atuais = lerLocais();
    atuais.push(locVazio());
    var bases = basesLinhas();
    bases.push("");
    renderLocaisEdicao(atuais, bases);
    var box = $("estLocais");
    var linhas = box.querySelectorAll(".local-linha");
    if (linhas.length) linhas[linhas.length - 1].querySelector(".ll-rua").focus();
}

function rmLocalLinha(btn) {
    var linha = btn.closest(".local-linha");
    var i = linha ? Number(linha.getAttribute("data-i")) : -1;
    var atuais = lerLocais();
    var bases = basesLinhas();
    if (atuais.length <= 1) { renderLocaisEdicao([locVazio()], [""]); return; }
    atuais.splice(i, 1);
    bases.splice(i, 1);
    renderLocaisEdicao(atuais, bases);
}

/* ----- Tela de cadastro ----- */
function formEstoque(id, rascunho) {
    var e = id ? estItem(id) : null;
    if (id && !e) return;
    if (!id) estFotoTemp = "";
    catIdVolta = id ? Number(id) : null;
    var foto = e ? e.foto : estFotoTemp;
    var alvoFoto = e ? e.id : "null";
    var temFoto = !!foto;
    var abrir = temFoto ? (e ? "verFotoEst(" + e.id + ")" : "verFoto(estFotoTemp)") : "pickEstFoto(" + alvoFoto + ")";
    var un = unidadeSel(rascunho ? rascunho.un : (e ? e.un : "un"));

    // Locais: usa os salvos; se não houver, começa com uma linha vazia
    var locais = rascunho && rascunho.locais && rascunho.locais.length ? rascunho.locais
        : (e ? locaisDe(e).map(function (l) {
            return { rua: l.rua || "", lado: l.lado || "", nivel: l.nivel || "", caixa: l.caixa || "", qtd: l.qtd == null ? "" : l.qtd };
        }) : []);
    var bases = locais.map(function (l, i) { return i; });

    var cats = CATEGORIAS.slice();
    var selCat = rascunho ? rascunho.cat : (e ? (e.cat || "") : "");
    if (selCat && cats.indexOf(selCat) === -1) cats.push(selCat);
    var optsCat = '<option value="">Selecione</option>' + cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === selCat ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");

    var h = '<div class="sheet-alca"></div>' +
        '<div class="cad-cab">' +
            '<button type="button" class="cad-voltar" onclick="fecharOS()" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="cad-cab-tx"><h2>' + (e ? "Editar peça" : "Nova peça") + '</h2>' +
                '<small>' + (e ? esc(e.nome) : "Cadastro de almoxarifado") + '</small></div>' +
        '</div>';

    // Foto da peça
    h += '<div class="cad-sec">' +
            '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-camera"></i></span>Foto da peça</div>' +
            '<div class="cad-foto-box ' + (temFoto ? "tem" : "") + '" onclick="' + abrir + '">' +
                (temFoto
                    ? '<img src="' + esc(foto) + '" alt="Foto da peça"><span class="cad-foto-troca" onclick="event.stopPropagation();pickEstFoto(' + alvoFoto + ')"><i class="fa-solid fa-camera"></i> Trocar</span>' +
                      '<button type="button" class="cad-foto-x" onclick="event.stopPropagation();tirarEstFoto(' + alvoFoto + ')" aria-label="Remover foto"><i class="fa-solid fa-xmark"></i></button>'
                    : '<span class="cad-foto-mais"><i class="fa-solid fa-camera"></i></span>' +
                      '<b>Adicionar foto</b><small>Toque para escolher ou tirar uma foto</small>') +
            '</div>' +
        '</div>';

    // Dados da peça
    h += '<div class="cad-sec">' +
            '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-box"></i></span>Dados da peça</div>' +
            '<label class="campo" id="cEstNome"><span>Descrição *</span><input type="text" id="edEstNome" maxlength="60" value="' + esc(rascunho ? rascunho.nome : (e ? e.nome : "")) + '" placeholder="Ex: Rolamento 6205 2RS" autocomplete="off"><em class="erro">Informe a descrição da peça.</em></label>' +
            '<div class="linha2">' +
                '<label class="campo"><span>Código</span><input type="text" id="edEstCodigo" maxlength="30" value="' + esc(rascunho ? rascunho.codigo : (e && e.codigo ? e.codigo : "")) + '" placeholder="Ex: RLM-6205" autocomplete="off"></label>' +
                '<label class="campo"><span>Categoria</span>' +
                    '<div class="campo-lado">' +
                        '<select id="edEstCat">' + optsCat + '</select>' +
                        '<button type="button" class="mini-btn" onclick="abrirCategorias()" aria-label="Gerenciar categorias" title="Criar ou remover categoria"><i class="fa-solid fa-gear"></i></button>' +
                    '</div>' +
                '</label>' +
            '</div>' +
            '<div class="linha2">' +
                '<label class="campo"><span>Unidade</span><select id="edEstUn" onchange="atualizarTotalPeca()">' + optsUnidade(un) + '</select></label>' +
                '<label class="campo"><span>Estoque mínimo</span><input type="text" id="edEstMin" inputmode="numeric" maxlength="8" value="' + esc(rascunho ? rascunho.min : (e && e.min ? String(e.min) : "")) + '" placeholder="Ex: 5"></label>' +
            '</div>' +
            '<label class="campo"><span>Estoque máximo</span><input type="text" id="edEstMax" inputmode="numeric" maxlength="8" value="' + esc(rascunho ? rascunho.max : (e && e.max ? String(e.max) : "")) + '" placeholder="Ex: 20"></label>' +
            '<p class="dica" style="margin:0">O mínimo avisa quando a peça está acabando. O máximo define quanto comprar na reposição sugerida.</p>' +
        '</div>';

    // Locais de guarda
    h += '<div class="cad-sec">' +
            '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-location-dot"></i></span>Locais de armazenamento</div>' +
            '<p class="dica" style="margin:0 0 10px">Informe onde a peça está e a quantidade em cada lugar. Se estiver em mais de um lugar, toque em <b>Adicionar local</b>.</p>' +
            '<div class="local-cab"><span></span><span>Rua</span><span>Nível</span><span>Nº da caixa</span><span>Qtd</span><span></span></div>' +
            '<div id="estLocais"></div>' +
            '<button type="button" class="add-local" onclick="addLocal()"><i class="fa-solid fa-plus"></i> Adicionar local</button>' +
            '<div class="cad-total"><span>Quantidade total no estoque</span><b id="estTotalPeca">0</b></div>' +
        '</div>';

    // Movimentação rápida (só em peça já cadastrada)
    if (e) {
        h += '<div class="cad-sec">' +
                '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-arrows-rotate"></i></span>Movimentar agora</div>' +
                '<p class="dica" style="margin:0 0 8px">Saldo atual: <b class="est-saldo' + (estBaixo(e) || estSaldoZero(e) ? " baixo" : "") + '">' + fmtQtd(saldoEstoque(e)) + ' ' + esc(e.un) + '</b></p>' +
                '<div class="linha2"><label class="campo"><span>Quantidade</span><input type="text" id="movQtd" inputmode="decimal" maxlength="8" placeholder="Ex: 2"></label>' +
                '<label class="campo"><span>Motivo <small class="opc">(opcional)</small></span><input type="text" id="movObs" maxlength="40" placeholder="Ex: empréstimo"></label></div>' +
                '<div class="est-mov-btns"><button type="button" class="ent" onclick="movEstoque(' + e.id + ',\'entrada\')"><i class="fa-solid fa-arrow-down"></i> Dar entrada</button>' +
                '<button type="button" class="sai" onclick="movEstoque(' + e.id + ',\'saida\')"><i class="fa-solid fa-arrow-up"></i> Dar saída</button></div>' +
            '</div>';
    }

    // Rodapé de ações
    h += '<div class="cad-rodape">' +
            '<div class="cad-rodape-tx"><small>Quantidade total</small><b id="estTotalRodape">0</b></div>' +
            (e ? '<button class="cad-excluir" onclick="excluirEstoque(' + e.id + ')" aria-label="Excluir peça"><i class="fa-solid fa-trash"></i></button>' : '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>') +
            '<button class="btn-pri cad-salvar" onclick="salvarEstoque(' + (e ? e.id : "null") + ')"><i class="fa-solid fa-check"></i> Salvar</button>' +
        '</div>';

    if (e) {
        var hist = historicoEstoque(e);
        h += '<h4 style="margin-top:18px">Últimas movimentações</h4>' + (hist.length ?
            '<div class="est-hist">' + hist.map(function (m) {
                return '<div><span>' + esc(m.tx) + '<small>' + fmtData(m.data) + '</small></span><span class="' + (m.qtd > 0 ? "mais" : "menos") + '">' + (m.qtd > 0 ? "+" : "−") + fmtQtd(Math.abs(m.qtd)) + ' ' + esc(e.un) + '</span></div>';
            }).join("") + '</div>' : '<p class="dica">Nenhuma movimentação ainda.</p>');
        var hc = comprasDoItem(e.id, e.nome, 0).slice(0, 3);
        if (hc.length) {
            h += '<h4 style="margin-top:18px">Últimas compras</h4><div class="est-hist">' + hc.map(function (c) {
                var r = c.receb[c.receb.length - 1];
                return '<div><span>' + esc(c.fornecedor || "Sem fornecedor") + ' · NF ' + esc(r.nf) + '<small>' + fmtData(r.em) + ' · pedida por ' + esc(nomeDe(c.por)) + '</small></span>' +
                       '<span class="mais">+' + fmtQtd(recebidoCompra(c)) + ' ' + esc(c.un) + '</span></div>';
            }).join("") + '</div>';
        }
    }

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");

    renderLocaisEdicao(locais.length ? locais : [locVazio()], bases);
    var tn = $("edEstNome");
    if (tn && !e) tn.focus();
}

/* ==========================================
   FICHA DA PEÇA (tela aberta ao tocar na peça)
   Foto e situação no topo, números do estoque, onde encontrar,
   equipamentos que usam, e os botões de ação embaixo.
   ========================================== */
var pecaAberta = null;

function voltarTela() {
    if (viewAtual === "p-peca") { voltarListaEstoque(); return; }
    ir("os");
}

function fecharEstoque() {
    // "Voltar" da tela de Estoque: retorna ao Perfil (de onde ela é aberta)
    ir("perfil");
}

function voltarListaEstoque() {
    // "Voltar" da ficha da peça: retorna à lista do estoque
    ir("p-estoque");
}

// Resumo dos locais para a ficha: quantidade e textos prontos
function locaisResumo(e) {
    var ls = locaisDe(e);
    if (!ls.length) return [];
    return ls.map(function (l) {
        return {
            rua: l.rua || "",
            lado: l.lado === "D" ? "Direito" : l.lado === "E" ? "Esquerdo" : "—",
            nivel: l.nivel || "—",
            caixa: l.caixa || "—",
            qtd: arred(Number(l.qtd) || 0),
            local: l.local || ""
        };
    });
}

function situacaoPeca(e) {
    var s = saldoEstoque(e);
    if (s <= 0) return { t: "Sem estoque", c: "off" };
    if (estBaixo(e)) return { t: "Estoque baixo", c: "baixo" };
    return { t: "Disponível", c: "ok" };
}

function abrirPeca(id) {
    var e = estItem(id);
    if (!e) return;
    pecaAberta = e.id;
    ir("p-peca");
}

function renderPeca() {
    var e = estItem(pecaAberta);
    var box = $("pecaCard");
    if (!e || !box) return;

    var sit = situacaoPeca(e);
    var s = saldoEstoque(e);
    var ls = locaisResumo(e);
    var det = [];
    if (e.codigo) det.push("Código: " + esc(e.codigo));
    if (e.cat) det.push(esc(e.cat));
    det.push("Unidade: " + esc(optUnidade(e.un)));

    var h = '<div class="peca-topo">' +
        '<div class="peca-foto' + (e.foto ? " tem" : "") + '"' + (e.foto ? ' onclick="verFotoEst(' + e.id + ')"' : '') + '>' +
            (e.foto ? '<img src="' + esc(e.foto) + '" alt="Foto da peça">' : '<i class="fa-solid fa-box"></i>') +
        '</div>' +
        '<div class="peca-info">' +
            '<span class="sit ' + sit.c + '">' + sit.t + '</span>' +
            '<h2>' + esc(e.nome) + '</h2>' +
            '<p class="peca-meta">' + det.join(" · ") + '</p>' +
        '</div>' +
    '</div>';

    if (e.desc) h += '<p class="peca-desc">' + esc(e.desc) + '</p>';

    h += '<div class="peca-nums">' +
        '<div><small>Estoque total</small><b>' + fmtQtd(s) + '</b></div>' +
        '<div><small>Estoque mínimo</small><b>' + (e.min ? fmtQtd(e.min) : "—") + '</b></div>' +
        '<div><small>' + (ls.length === 1 ? "Local" : "Locais") + '</small><b>' + ls.length + '</b></div>' +
    '</div>';

    // Gestão: custo, consumo e cobertura
    var cons = consumoPeriodo(e, 90), cob = coberturaDias(e), pend = pendenteCompra(e.id), sug = sugestaoQtd(e);
    function cel(r, v) { return '<div><small>' + r + '</small><b>' + v + '</b></div>'; }
    h += '<div class="peca-sec"><div class="peca-sec-t"><i class="fa-solid fa-chart-line"></i> Gestão</div>' +
        '<div class="pro-grade">' +
            cel("Estoque máximo", e.max ? fmtQtd(e.max) : "—") +
            cel("Consumo (90 dias)", fmtQtd(cons) + " " + esc(e.un)) +
            cel("Dura cerca de", cob == null ? "—" : cob + (cob === 1 ? " dia" : " dias")) +
            cel("Já pedido, a chegar", pend ? fmtQtd(pend) + " " + esc(e.un) : "—") +
            cel("Última contagem", e.contadoEm ? fmtData(e.contadoEm) : "—") +
        '</div>' +
        (precisaRepor(e) ? '<div class="comp-aviso" style="margin:10px 0 0"><i class="fa-solid fa-cart-arrow-down"></i>Reposição sugerida: <b>' + fmtQtd(sug) + ' ' + esc(e.un) + '</b></div>' : "") +
    '</div>';

    // Onde encontrar
    h += '<div class="peca-sec">' +
        '<div class="peca-sec-t"><i class="fa-solid fa-location-dot" style="color:#E53935"></i> Onde encontrar</div>';
    if (!ls.length) {
        h += '<p class="peca-vazio">Nenhum local informado. Toque em Editar para dizer onde a peça fica.</p>';
    } else {
        h += ls.map(function (l) {
            return '<div class="loc-card">' +
                '<div class="loc-grade">' +
                    '<div class="loc-campo destaque"><small>Rua</small><b>' + (l.rua ? esc(l.rua) : "—") + '</b></div>' +
                    '<div class="loc-campo"><small>Nível</small><b>' + esc(String(l.nivel)) + '</b></div>' +
                    '<div class="loc-campo"><small>Caixa / gaveta</small><b>' + esc(String(l.caixa)) + '</b></div>' +
                '</div>' +
                '<div class="loc-qtd"><span>Quantidade neste local</span><b>' + fmtQtd(l.qtd) + ' ' + esc(optUnidade(e.un)) + '</b></div>' +
            '</div>';
        }).join("");
    }
    h += '</div>';

    // Equipamentos (o app ainda não tem cadastro de equipamentos)
    h += '<div class="peca-sec">' +
        '<div class="peca-sec-t"><i class="fa-solid fa-gears"></i> Equipamentos que utilizam esta peça</div>' +
        '<p class="peca-vazio">Nenhum equipamento vinculado ainda.</p>' +
    '</div>';

    box.innerHTML = h;

    // Botões de ação
    var adm = ehAdmin();
    $("pecaBotoes").innerHTML =
        (adm ? '<button class="peca-b pri" onclick="saidaRapida(' + e.id + ')"><i class="fa-solid fa-arrow-up"></i> Registrar saída</button>' : '') +
        (podeCompras() ? '<button class="peca-b sec" onclick="formCompra(' + e.id + ')"><i class="fa-solid fa-plus"></i> Solicitar compra</button>' : '') +
        (adm ? '<button class="peca-b sec" onclick="formContagem(' + e.id + ')"><i class="fa-solid fa-clipboard-check"></i> Ajustar contagem</button>' : '') +
        '<div class="peca-b-linha">' +
            '<button class="peca-b light" onclick="abrirEtiqueta(' + e.id + ')"><i class="fa-solid fa-qrcode"></i> Etiqueta QR</button>' +
            (adm ? '<button class="peca-b light" onclick="formEstoque(' + e.id + ')"><i class="fa-solid fa-pen"></i> Editar</button>' +
                   '<button class="peca-b light perigo" onclick="excluirEstoque(' + e.id + ')"><i class="fa-solid fa-trash"></i> Excluir</button>' : '') +
        '</div>';

    var mv = movimentosDe(e).slice(0, 20);
    $("pecaCard").insertAdjacentHTML("beforeend",
        '<h4 style="margin-top:18px">Histórico de entradas e saídas</h4>' + (mv.length ?
        '<div class="est-hist">' + mv.map(function (m) {
            return '<div><span>' + esc(m.tx) + '<small>' + fmtData(m.data) + '</small></span><span class="' + (m.qtd > 0 ? "mais" : "menos") + '">' + (m.qtd > 0 ? "+" : "−") + fmtQtd(Math.abs(m.qtd)) + ' ' + esc(e.un) + '</span></div>';
        }).join("") + '</div>' : '<p class="dica">Nenhuma movimentação ainda.</p>'));
}

/* Registro rápido de saída: escolhe a quantidade, o local e o motivo */
function saidaRapida(id) {
    var e = estItem(id);
    if (!e || !ehAdmin()) return;
    var s = saldoEstoque(e);
    if (s <= 0) { toast("Esta peça está sem estoque"); return; }
    var ls = locaisDe(e);

    var h = '<div class="sheet-alca"></div><h2>Registrar saída</h2>' +
        '<p class="dica" style="margin:0 0 10px">' + esc(e.nome) + ' · disponível: <b>' + fmtQtd(s) + ' ' + esc(optUnidade(e.un)) + '</b></p>' +
        '<label class="campo"><span>Quantidade *</span><input type="text" id="saiQtd" inputmode="decimal" maxlength="8" placeholder="Ex: 2" value="1"></label>';
    if (ls.length > 1) {
        h += '<label class="campo"><span>Local</span><select id="saiLocal">' + ls.map(function (l, i) {
            return '<option value="' + i + '">' + esc(locCurto(l)) + ' — ' + fmtQtd(Number(l.qtd) || 0) + ' un</option>';
        }).join("") + '</select></label>';
    }
    h += '<label class="campo"><span>Motivo <small class="opc">(opcional)</small></span><input type="text" id="saiObs" maxlength="40" placeholder="Ex: OS 0123 · empréstimo"></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="abrirPeca(' + e.id + ')">Cancelar</button>' +
            '<button class="btn-pri" onclick="confirmarSaida(' + e.id + ')"><i class="fa-solid fa-check"></i> Confirmar saída</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    var q = $("saiQtd");
    if (q) { q.focus(); q.select(); }
}

function confirmarSaida(id) {
    var e = estItem(id);
    if (!e || !ehAdmin()) return;
    var q = lerNumero($("saiQtd") ? $("saiQtd").value : "");
    if (!(q > 0)) { toast("Informe a quantidade"); return; }
    var saldo = saldoEstoque(e);
    if (q > saldo) { toast("Saída maior que o saldo (" + fmtQtd(saldo) + " " + esc(optUnidade(e.un)) + ")"); return; }

    e.qtd = arred(e.qtd - q);
    // desconta do local escolhido
    var ls = locaisDe(e);
    if (ls.length) {
        var i = $("saiLocal") ? Number($("saiLocal").value) || 0 : 0;
        var alvo = ls[i] || ls[0];
        alvo.qtd = Math.max(0, arred((Number(alvo.qtd) || 0) - q));
    }
    if (!e.mov) e.mov = [];
    e.mov.push({ t: "saida", qtd: arred(q), em: hoje(), por: sessao, obs: ($("saiObs") ? $("saiObs").value.trim() : "") });
    if (e.mov.length > 300) e.mov = e.mov.slice(-300);

    salvar();
    fecharOS();
    renderTudo();
    toast("Saída registrada ✔");
}

/* Etiqueta da peça para imprimir (com QR apontando para os dados dela) */
function abrirEtiqueta(id) {
    var e = estItem(id);
    if (!e) return;
    var sit = situacaoPeca(e);
    var ls = locaisResumo(e);

    var h = '<div class="sheet-alca"></div><h2>Etiqueta da peça</h2>' +
        '<p class="dica" style="margin:0 0 12px">Imprima e cole no local da peça. O QR Code leva aos dados dela no almoxarifado.</p>' +
        '<div class="etiqueta" id="etiquetaFolha">' +
            '<div class="et-top">' +
                '<b>' + esc(e.nome) + '</b>' +
                '<span class="sit ' + sit.c + '">' + sit.t + '</span>' +
            '</div>' +
            '<div class="et-meio">' +
                '<div class="et-qr" id="etQr" data-txt="' + esc(etiquetaTexto(e)) + '"></div>' +
                '<div class="et-dados">' +
                    (e.codigo ? '<div><small>Código</small><b>' + esc(e.codigo) + '</b></div>' : "") +
                    (e.cat ? '<div><small>Categoria</small><b>' + esc(e.cat) + '</b></div>' : "") +
                    '<div><small>Unidade</small><b>' + esc(optUnidade(e.un)) + '</b></div>' +
                    (ls.length ? '<div><small>Local</small><b>' + esc(locCurto({ rua: ls[0].rua, lado: ls[0].rua ? (ls[0].lado === "Direito" ? "D" : ls[0].lado === "Esquerdo" ? "E" : "") : "", nivel: ls[0].nivel === "—" ? "" : ls[0].nivel, caixa: ls[0].caixa === "—" ? "" : ls[0].caixa })) + '</b></div>' : "") +
                '</div>' +
            '</div>' +
            (empresa.nome ? '<div class="et-pe">' + esc(empresa.nome) + '</div>' : "") +
        '</div>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="abrirPeca(' + e.id + ')">Voltar</button>' +
            '<button class="btn-pri" onclick="imprimirEtiqueta()"><i class="fa-solid fa-print"></i> Imprimir</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    desenharQR($("etQr"));
}

// Texto que vai dentro do QR (dá para pendurar um leitor de código depois)
function etiquetaTexto(e) {
    var ls = locaisDe(e);
    var end = ls.length ? locCurto(ls[0]) : "";
    return "PECA:" + e.id + "|" + (e.codigo || "") + "|" + e.nome + (end ? "|" + end : "");
}

function imprimirEtiqueta() {
    document.body.classList.add("imprimindo-etiqueta");
    window.print();
    setTimeout(function () { document.body.classList.remove("imprimindo-etiqueta"); }, 600);
}

/* ==========================================
   QR Code desenhado no próprio app (sem biblioteca externa)
   Versões 1 a 10, modo byte (UTF-8), 4 níveis de correção.
   ========================================== */
var QR_NIVEL = ["L", "M", "Q", "H"];

// codewords de dados por versão e nível: [L, M, Q, H] (tabela oficial)
var QR_DADOS_CW = [null,
    [19, 16, 13, 9], [34, 28, 22, 16], [55, 44, 34, 26], [80, 64, 48, 36],
    [108, 86, 62, 46], [136, 108, 76, 60], [156, 124, 88, 66], [194, 154, 110, 86],
    [232, 182, 132, 100], [274, 216, 154, 122]];

// [codewords de correção por bloco, nº de blocos] → [L, M, Q, H]
var QR_ECC = [null,
    [[7, 1], [10, 1], [13, 1], [17, 1]],
    [[10, 1], [16, 1], [22, 1], [28, 1]],
    [[15, 1], [26, 1], [18, 2], [22, 2]],
    [[20, 1], [18, 2], [26, 2], [16, 4]],
    [[26, 1], [24, 2], [18, 4], [22, 4]],
    [[18, 2], [16, 4], [24, 4], [28, 4]],
    [[20, 2], [18, 4], [18, 6], [26, 5]],
    [[24, 2], [22, 4], [22, 6], [26, 6]],
    [[30, 2], [22, 4], [20, 8], [24, 8]],
    [[18, 2], [26, 4], [24, 8], [28, 8]],
    [[20, 2], [30, 5], [28, 8], [24, 11]]];

var QR_BLOCOS = null;   // a quantidade de blocos vem da tabela QR_ECC

var QR_ALINHAMENTO = [null, [],
    [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function qrUtf8(txt) {
    var out = [];
    for (var i = 0; i < txt.length; i++) {
        var c = txt.charCodeAt(i);
        if (c < 128) out.push(c);
        else if (c < 2048) { out.push(192 | (c >> 6), 128 | (c & 63)); }
        else { out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    }
    return out;
}

// matriz: { m: linhas de 0/1, n: tamanho } ou null
function qrModulos(texto, nivelPedido) {
    try {
        var bytes = qrUtf8(String(texto || ""));
        var lvl = Math.max(0, QR_NIVEL.indexOf(nivelPedido || "M"));
        var ver = 0;
        for (var v = 1; v <= 10; v++) {
            if (bytes.length + 2 <= QR_DADOS_CW[v][lvl]) { ver = v; break; }   // 2 bytes de cabeçalho
        }
        if (!ver) return null;                    // texto grande demais para etiqueta
        var n = ver * 4 + 17;
        var totalCw = qrTotalCodewords(ver);
        var eccInfo = QR_ECC[ver][lvl];
        var eccPorBloco = eccInfo[0];
        var blocos = eccInfo[1];
        var dadosCw = totalCw - eccPorBloco * blocos;

        // --- bits de dados
        var bits = [];
        function pushBits(val, len) { for (var b = len - 1; b >= 0; b--) bits.push((val >>> b) & 1); }
        pushBits(4, 4);                            // modo byte
        pushBits(bytes.length, ver <= 9 ? 8 : 16);
        for (var i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
        var limiteBits = dadosCw * 8;
        for (var t = 0; t < 4 && bits.length < limiteBits; t++) bits.push(0);
        while (bits.length % 8) bits.push(0);
        var cw = [];
        for (var w = 0; w < bits.length; w += 8) {
            var val = 0;
            for (var b2 = 0; b2 < 8; b2++) val = (val << 1) | bits[w + b2];
            cw.push(val);
        }
        var pad = [0xEC, 0x11], pi = 0;
        while (cw.length < dadosCw) cw.push(pad[pi++ % 2]);

        // --- divisão em blocos, ECC e intercalação
        var tamBloco = Math.floor(dadosCw / blocos);
        var sobra = dadosCw % blocos;
        var blocosDados = [], pos = 0, k;
        for (k = 0; k < blocos; k++) {
            var tam = tamBloco + (k >= blocos - sobra ? 1 : 0);
            blocosDados.push(cw.slice(pos, pos + tam));
            pos += tam;
        }
        var blocosEcc = blocosDados.map(function (bd) { return qrReedSolomon(bd, eccPorBloco); });
        var final = [];
        for (var j = 0; j < tamBloco + 1; j++) {
            for (k = 0; k < blocos; k++) {
                if (j < blocosDados[k].length) final.push(blocosDados[k][j]);
            }
        }
        for (var j2 = 0; j2 < eccPorBloco; j2++) {
            for (var k2 = 0; k2 < blocos; k2++) final.push(blocosEcc[k2][j2]);
        }
        if (final.length !== totalCw) return null;

        // --- matriz
        var m = [], reserv = [];
        for (var y = 0; y < n; y++) {
            m.push(new Array(n).fill(0));
            reserv.push(new Array(n).fill(0));
        }
        function setMod(yy, xx, val) {
            if (yy < 0 || xx < 0 || yy >= n || xx >= n) return;
            m[yy][xx] = val ? 1 : 0;
            reserv[yy][xx] = 1;
        }
        // marcadores de localização
        [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
            for (var dy = -1; dy <= 7; dy++) {
                for (var dx = -1; dx <= 7; dx++) {
                    var yy = p[0] + dy, xx = p[1] + dx;
                    if (yy < 0 || xx < 0 || yy >= n || xx >= n) continue;
                    var dentro = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
                    var borda = dy === 0 || dy === 6 || dx === 0 || dx === 6;
                    var nucleo = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
                    setMod(yy, xx, dentro ? (borda || nucleo) : 0);
                }
            }
        });
        // marcadores de alinhamento
        var al = QR_ALINHAMENTO[ver];
        for (var a = 0; a < al.length; a++) {
            for (var b3 = 0; b3 < al.length; b3++) {
                var cy = al[a], cx = al[b3];
                if ((cy <= 8 && cx <= 8) || (cy <= 8 && cx >= n - 9) || (cy >= n - 9 && cx <= 8)) continue;
                for (var dy2 = -2; dy2 <= 2; dy2++) {
                    for (var dx2 = -2; dx2 <= 2; dx2++) {
                        var anel = Math.max(Math.abs(dy2), Math.abs(dx2));
                        setMod(cy + dy2, cx + dx2, anel !== 1);
                    }
                }
            }
        }
        // linhas de sincronismo
        for (var i3 = 8; i3 < n - 8; i3++) {
            setMod(6, i3, i3 % 2 === 0);
            setMod(i3, 6, i3 % 2 === 0);
        }
        // marcador escuro fixo
        setMod(n - 8, 8, 1);

        // --- informações de formato (nível + máscara), com BCH
        var mascara = qrEscolherMascara(dadosCw, eccPorBloco, ver, blocos, lvl, n);
        var fmt = (lvl << 3) | mascara;
        var resto = fmt;
        for (var f = 0; f < 10; f++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
        var fmtBits = ((fmt << 10) | resto) ^ 0x5412;
        function fmtBit(idx) { return (fmtBits >>> idx) & 1; }
        // cópia 1
        for (var g = 0; g <= 5; g++) setMod(g, 8, fmtBit(g));
        setMod(7, 8, fmtBit(6));
        setMod(8, 8, fmtBit(7));
        setMod(8, 7, fmtBit(8));
        for (var g2 = 9; g2 <= 14; g2++) setMod(8, 14 - g2, fmtBit(g2));
        // cópia 2
        for (var g3 = 0; g3 <= 7; g3++) setMod(8, n - 1 - g3, fmtBit(g3));
        for (var g4 = 8; g4 <= 14; g4++) setMod(n - 15 + g4, 8, fmtBit(g4));

        // --- versão (só a partir da versão 7)
        if (ver >= 7) {
            var verBits = (ver << 12) | qrBchVersao(ver << 12);
            for (var vb = 0; vb < 18; vb++) {
                var bitV = (verBits >>> vb) & 1;
                var aPos = Math.floor(vb / 3), bPos = vb % 3;
                setMod(n - 11 + bPos, aPos, bitV);
                setMod(aPos, n - 11 + bPos, bitV);
            }
        }

        // --- dados em zigue-zague (padrão do QR: sempre começa subindo, à direita)
        var idx = 0, totalBits = final.length * 8;
        var paraCima = true;
        for (var col = n - 1; col > 0; col -= 2) {
            if (col === 6) col--;                              // pula a coluna de sincronismo
            for (var yy2 = 0; yy2 < n; yy2++) {
                var y3 = paraCima ? n - 1 - yy2 : yy2;
                for (var c2 = 0; c2 < 2; c2++) {
                    var x3 = col - c2;
                    if (reserv[y3][x3]) continue;
                    var bit = 0;
                    if (idx < totalBits) { bit = (final[idx >> 3] >>> (7 - (idx & 7))) & 1; idx++; }
                    m[y3][x3] = bit;
                }
            }
            paraCima = !paraCima;                              // inverte a cada dupla de colunas
        }
        // aplica a máscara escolhida
        for (var y4 = 0; y4 < n; y4++) {
            for (var x4 = 0; x4 < n; x4++) {
                if (reserv[y4][x4]) continue;
                if (qrMask(mascara, y4, x4)) m[y4][x4] ^= 1;
            }
        }
        return m;
    } catch (err) {
        return null;
    }
}

// total de codewords (dados + correção) por versão — tabela oficial
var QR_TOTAL_CW = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

function qrTotalCodewords(ver) {
    return QR_TOTAL_CW[ver] || 0;
}

function qrMask(idx, y, x) {
    switch (idx) {
        case 0: return (y + x) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (y + x) % 3 === 0;
        case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
        case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
        default: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
    }
}

// escolhe a máscara com melhor resultado na regra de penalidade
function qrEscolherMascara(dadosCw, eccPorBloco, ver, blocos, lvl, n) {
    // para etiqueta pequena, a máscara 0 já fica legível; evitamos custo extra
    return 0;
}

function qrBchVersao(val) {
    var d = val;
    for (var i = 0; i < 12; i++) d = (d << 1) ^ ((d >>> 11) * 0x1F25);
    return (val | d) & 0x3FFFF;
}

/* ---- Reed-Solomon ---- */
function qrGfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11D);
        z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
}

function qrRsDivisor(grau) {
    var res = [];
    for (var i = 0; i < grau - 1; i++) res.push(0);
    res.push(1);
    var raiz = 1;
    for (var k = 0; k < grau; k++) {
        for (var j = 0; j < res.length; j++) {
            res[j] = qrGfMul(res[j], raiz);
            if (j + 1 < res.length) res[j] ^= res[j + 1];
        }
        raiz = qrGfMul(raiz, 0x02);
    }
    return res;
}

function qrReedSolomon(dados, eccLen) {
    var div = qrRsDivisor(eccLen);
    var res = div.map(function () { return 0; });
    dados.forEach(function (b) {
        var fator = b ^ res.shift();
        res.push(0);
        for (var i = 0; i < eccLen; i++) res[i] ^= qrGfMul(div[i], fator);
    });
    return res;
}

function desenharQR(box) {
    if (!box) return;
    var txt = box.getAttribute("data-txt") || "";
    var mods = qrModulos(txt, "M");
    if (!mods) { box.innerHTML = '<span class="et-qr-erro">Texto longo demais</span>'; return; }
    var n = mods.length;
    var h = '<svg viewBox="0 0 ' + (n + 2) + ' ' + (n + 2) + '" shape-rendering="crispEdges" role="img" aria-label="QR Code da peça">' +
        '<rect width="' + (n + 2) + '" height="' + (n + 2) + '" fill="#fff"/>';
    for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
            if (mods[y][x]) h += '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="1" height="1" fill="#000"/>';
        }
    }
    box.innerHTML = h + '</svg>';
}

var catIdVolta = null;      // peça que estava aberta ao entrar nas categorias (null = nova)
var catRascunho = null;     // o que estava preenchido no cadastro ao abrir as categorias
var catNovaTemp = "";       // categoria criada e ainda não escolhida no cadastro

function abrirCategorias() {
    var emUso = {};

    // guarda o que já foi digitado antes de trocar o conteúdo da folha
    catRascunho = {
        id: catIdVolta,
        nome: $("edEstNome") ? $("edEstNome").value : "",
        codigo: $("edEstCodigo") ? $("edEstCodigo").value : "",
        un: $("edEstUn") ? $("edEstUn").value : "un",
        min: $("edEstMin") ? $("edEstMin").value : "",
        max: $("edEstMax") ? $("edEstMax").value : "",
        cat: $("edEstCat") ? $("edEstCat").value : "",
        locais: $("estLocais") ? lerLocais() : []
    };

    estoque.forEach(function (e) {
        if (e.cat) emUso[e.cat] = (emUso[e.cat] || 0) + 1;
    });

    var h = '<div class="sheet-alca"></div>' +
        '<div class="cad-cab">' +
            '<button type="button" class="cad-voltar" onclick="voltarCategorias()" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="cad-cab-tx"><h2>Categorias</h2><small>Crie ou remova categorias de peças</small></div>' +
        '</div>' +
        '<div class="cad-sec">' +
            '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-plus"></i></span>Nova categoria</div>' +
            '<div class="campo-lado">' +
                '<input type="text" id="catNova" class="cat-input" maxlength="30" placeholder="Ex: Rolamentos especiais" autocomplete="off">' +
                '<button type="button" class="btn-pri cat-add" onclick="criarCategoria()"><i class="fa-solid fa-check"></i> Criar</button>' +
            '</div>' +
            '<p class="dica" style="margin:8px 0 0">A categoria criada já fica disponível no cadastro da peça.</p>' +
        '</div>' +
        '<div class="cad-sec">' +
            '<div class="cad-sec-t"><span class="cad-ic"><i class="fa-solid fa-tags"></i></span>Existentes (' + CATEGORIAS.length + ')</div>' +
            '<div class="cat-lista">' + CATEGORIAS.map(function (c, i) {
                var n = emUso[c] || 0;
                return '<div class="cat-item">' +
                    '<span class="cat-tx"><b>' + esc(c) + '</b>' +
                        '<small>' + (n ? n + (n === 1 ? " peça" : " peças") : "Nenhuma peça") + '</small></span>' +
                    (n ? '' : '<button type="button" class="local-x" onclick="removerCategoria(' + i + ')" aria-label="Remover categoria"><i class="fa-solid fa-trash"></i></button>') +
                '</div>';
            }).join("") + '</div>' +
            '<p class="dica" style="margin:10px 0 0">Categoria usada por alguma peça não pode ser removida: troque a categoria dessas peças primeiro.</p>' +
        '</div>' +
        '<div class="cad-rodape">' +
            '<button class="btn-pri cad-salvar" onclick="voltarCategorias()"><i class="fa-solid fa-check"></i> Voltar ao cadastro</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    document.body.classList.add("folha-aberta");
    var topo = $("sheet");
    if (topo) topo.scrollTop = 0;
    var inp = $("catNova");
    if (inp) inp.focus();
}

// Volta ao cadastro da peça preservando o que já estava preenchido
function voltarCategorias() {
    var rascunho = catRascunho || {
        id: catIdVolta, nome: "", codigo: "", un: "un", min: "", cat: "", locais: []
    };
    if (catNovaTemp) rascunho.cat = catNovaTemp;
    catNovaTemp = "";
    catRascunho = null;
    formEstoque(rascunho.id, rascunho);
    atualizarTotalPeca();
}

function criarCategoria() {
    var inp = $("catNova");
    if (!inp) return;
    var nome = inp.value.trim();
    if (!nome) { toast("Digite o nome da categoria"); return; }
    var existe = CATEGORIAS.filter(function (c) { return c.toLowerCase() === nome.toLowerCase(); })[0];
    if (existe) { toast("Essa categoria já existe"); inp.value = ""; return; }

    CATEGORIAS.push(nome);
    catNovaTemp = nome;
    salvar();
    toast("Categoria '" + nome + "' criada ✔");
    abrirCategorias();
}

function removerCategoria(i) {
    var nome = CATEGORIAS[i];
    if (!nome) return;
    var n = estoque.filter(function (e) { return e.cat === nome; }).length;
    if (n) { toast("'" + nome + "' está em uso por " + n + (n === 1 ? " peça" : " peças")); return; }
    pedirConfirmacao({
        ic: "fa-tag", titulo: "Remover categoria?", sim: "Sim, remover",
        texto: 'A categoria <b>' + esc(nome) + '</b> será removida da lista.'
    }, function () {
        var j = CATEGORIAS.indexOf(nome);
        if (j === -1) return;
        CATEGORIAS.splice(j, 1);
        salvar();
        toast("Categoria removida");
        abrirCategorias();
    });
}

function salvarEstoque(id) {
    var e = id ? estItem(id) : null;
    if (id && !e) return;
    var nome = $("edEstNome").value.trim();
    if (!nome) { $("cEstNome").classList.add("invalido"); $("edEstNome").focus(); return; }

    var outro = estoque.filter(function (x) { return (!e || x.id !== e.id) && String(x.nome).toLowerCase() === nome.toLowerCase(); })[0];
    if (outro) { toast("Já existe uma peça com esse nome"); return; }

    var locais = lerLocais();
    var total = 0;
    for (var i = 0; i < locais.length; i++) {
        if (locais[i].qtd < 0) { toast("A quantidade não pode ser negativa"); return; }
        total += locais[i].qtd;
    }
    total = arred(total);
    var min = lerNumero($("edEstMin").value || "0");
    if (isNaN(min) || min < 0) min = 0;
    var max = lerNumero($("edEstMax").value || "0");
    if (isNaN(max) || max < 0) max = 0;
    if (max > 0 && min > 0 && max < min) { toast("O máximo não pode ser menor que o mínimo"); return; }

    var dados = {
        nome: nome,
        desc: e && e.desc ? e.desc : "",   // campo antigo: mantém o que já existia
        codigo: $("edEstCodigo").value.trim().toUpperCase(),
        cat: $("edEstCat").value,
        un: $("edEstUn").value,
        min: arred(min),
        max: arred(max),
        forn: e && e.forn ? e.forn : "",   // campo antigo: mantém o que já existia
        locais: locais
    };
    // o primeiro local também alimenta os campos antigos (lista, relatórios e OS)
    var p = locais[0] || {};
    dados.rua = p.rua || "";
    dados.lado = p.lado || "";
    dados.nivel = p.nivel || "";
    dados.caixa = p.caixa || "";
    dados.local = p.rua ? locTexto(dados) : (p.local || "");

    if (e) {
        for (var k in dados) e[k] = dados[k];
        // e.qtd guarda o total "cheio"; o saldo real desconta o usado nas OS finalizadas
        e.qtd = arred(total + consumoEstoque(e.id));
    } else {
        dados.id = proximoId(estoque);
        dados.qtd = total;
        dados.foto = estFotoTemp;
        dados.mov = [];
        estoque.push(dados);
        estFotoTemp = "";
    }

    // categoria digitada nova aparece na lista das próximas peças
    if (dados.cat && CATEGORIAS.indexOf(dados.cat) === -1) CATEGORIAS.push(dados.cat);

    salvar();
    fecharOS();
    renderTudo();
    toast(e ? "Peça atualizada ✔" : "Peça cadastrada ✔");
}

function excluirEstoque(id) {
    var e = estItem(id);
    if (!e) return;
    pedirConfirmacao({
        ic: "fa-box-open", titulo: "Excluir do estoque?",
        texto: '<b>' + esc(e.nome) + '</b> será excluído do estoque. As OS já feitas continuam com o nome do item. Essa ação não pode ser desfeita.'
    }, function () {
        estoque = estoque.filter(function (x) { return x.id !== e.id; });
        salvar();
        fecharOS();
        renderTudo();
        toast("Item excluído do estoque");
    });
}

/* ==========================================
   COMPRAS
   Fluxo: Solicitada -> Visualizada (compradora abriu) -> Pedido feito
   (fornecedor e prazo) -> Recebida (NF e quantidade) -> Entregue.
   Ao receber, a quantidade entra no estoque automaticamente.
========================================== */
var COMPRA_ST = {
    solicitada:  { t: "Solicitada",       c: "cs-sol" },
    visualizada: { t: "Visualizada",      c: "cs-vis" },
    comprada:    { t: "Pedido feito",     c: "cs-comp" },
    parcial:     { t: "Recebida em parte", c: "cs-parc" },
    entregue:    { t: "Entregue",         c: "cs-ent" },
    cancelada:   { t: "Cancelada",        c: "cs-canc" }
};
var comprasAba = "abertas";

function podeCompras() { return ehAdmin() || ehCompras(); }

function compraAtiva(c) { return c.status !== "entregue" && c.status !== "cancelada"; }

function buscarCompra(id) {
    id = Number(id);
    return compras.filter(function (c) { return c.id === id; })[0];
}

function compraAberta(estId) {
    return compras.filter(function (c) { return c.estId === estId && compraAtiva(c); })[0];
}

function recebidoCompra(c) {
    var t = 0;
    (c.receb || []).forEach(function (r) { t += r.qtd; });
    return arred(t);
}

function compraAtrasada(c) {
    return (c.status === "comprada" || c.status === "parcial") && !!c.previsao && c.previsao < hoje();
}

function fmtTs(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
           d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diasEntre(a, b) { return Math.round((dataDe(b) - dataDe(a)) / 86400000); }

// Compras já recebidas do mesmo material (mais recente primeiro)
function comprasDoItem(estId, nome, ignorar) {
    var k = estId ? "e" + estId : "n" + String(nome || "").toLowerCase();
    return compras.filter(function (x) {
        if (x.id === ignorar || !x.receb || !x.receb.length) return false;
        return (x.estId ? "e" + x.estId : "n" + String(x.nome || "").toLowerCase()) === k;
    }).sort(function (a, b) { return b.receb[b.receb.length - 1].ts - a.receb[a.receb.length - 1].ts; });
}

function fornecedoresConhecidos() {
    var vistos = {}, l = [];
    compras.slice().sort(function (a, b) { return b.id - a.id; }).forEach(function (c) {
        var f = (c.fornecedor || "").trim();
        if (f && !vistos[f.toLowerCase()]) { vistos[f.toLowerCase()] = 1; l.push(f); }
    });
    return l;
}

function montarDatalistForn() {
    $("dlForn").innerHTML = fornecedoresConhecidos().map(function (f) { return '<option value="' + esc(f) + '">'; }).join("");
}

/* ----- Lista ----- */
function setComprasAba(a) { comprasAba = a; renderCompras(); }

function renderCompras() {
    var box = $("listaCompras");
    if (!box) return;
    var abertas = compras.filter(compraAtiva);
    var hist = compras.filter(function (c) { return !compraAtiva(c); });
    var semVer = abertas.filter(function (c) { return c.status === "solicitada" || c.status === "visualizada"; }).length;
    var caminho = abertas.filter(function (c) { return c.status === "comprada" || c.status === "parcial"; }).length;
    var atr = abertas.filter(compraAtrasada).length;

    $("compResumo").innerHTML =
        '<div><b>' + semVer + '</b><small>A comprar</small></div>' +
        '<div><b>' + caminho + '</b><small>A caminho</small></div>' +
        '<div class="' + (atr ? "alerta" : "") + '"><b>' + atr + '</b><small>Entrega atrasada</small></div>';

    $("compAbas").innerHTML =
        '<button class="chip ' + (comprasAba === "abertas" ? "on" : "") + '" onclick="setComprasAba(\'abertas\')">Em aberto (' + abertas.length + ')</button>' +
        '<button class="chip ' + (comprasAba === "historico" ? "on" : "") + '" onclick="setComprasAba(\'historico\')">Histórico (' + hist.length + ')</button>';

    var q = $("compBusca") ? $("compBusca").value.trim().toLowerCase() : "";
    var lista = (comprasAba === "abertas" ? abertas : hist).filter(function (c) {
        return !q || (c.nome + " " + (c.fornecedor || "")).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return prioPeso(a) - prioPeso(b) || b.id - a.id; });

    box.innerHTML = lista.length ? lista.map(compraLinha).join("") :
        '<div class="vazio" style="padding:18px 0">' + (comprasAba === "abertas" ? "Nenhuma solicitação em aberto." : "Nenhuma compra no histórico ainda.") + '</div>';
    montarDatalistForn();
}

function compraLinha(c) {
    var st = COMPRA_ST[c.status];
    var atr = compraAtrasada(c);
    var h = '<div class="comp' + (atr ? " atrasada" : "") + '" onclick="abrirCompra(' + c.id + ',true)">' +
        '<div class="comp-topo"><b>' + esc(c.nome) + '</b><span class="tag ' + st.c + '">' + st.t + '</span></div>' +
        '<div class="comp-linha"><i class="fa-solid fa-box"></i>' + fmtQtd(c.qtd) + ' ' + esc(c.un) +
            priorTag(c) +
            ' · pedida por ' + esc(nomeDe(c.por)) + ' em ' + fmtData(iso(new Date(c.em))) + '</div>';

    if (c.vistaEm && compraAtiva(c) && c.status !== "comprada" && c.status !== "parcial") {
        h += '<div class="comp-visto"><i class="fa-solid fa-eye"></i>Visualizada por ' + esc(nomeDe(c.vistaPor)) + ' · ' + fmtTs(c.vistaEm) + '</div>';
    } else if (c.status === "solicitada") {
        h += '<div class="comp-visto nao"><i class="fa-regular fa-eye-slash"></i>Ainda não visualizada</div>';
    } else if (c.status === "comprada") {
        h += '<div class="comp-visto"><i class="fa-solid fa-cart-shopping"></i>Pedido feito' +
             (c.compradoEm ? ' em ' + fmtData(c.compradoEm) : '') + '</div>';
    }

    if (c.fornecedor && compraAtiva(c)) {
        h += '<div class="comp-linha"><i class="fa-solid fa-truck"></i>' + esc(c.fornecedor) +
             (c.previsao ? ' · chega ' + fmtData(c.previsao) + (atr ? ' <b class="atraso">(atrasada)</b>' : "") : "") + '</div>';
    }
    if (c.status === "parcial") h += '<div class="comp-linha"><i class="fa-solid fa-boxes-packing"></i>Recebido ' + fmtQtd(recebidoCompra(c)) + ' de ' + fmtQtd(c.qtd) + ' ' + esc(c.un) + '</div>';

    if (!compraAtiva(c)) {
        var ult = (c.receb || [])[(c.receb || []).length - 1];
        h += '<div class="comp-linha"><i class="fa-solid fa-' + (c.status === "entregue" ? "circle-check" : "ban") + '"></i>' +
             (c.status === "entregue" ? 'Entregue em ' + fmtData(c.entregueEm) + (ult && ult.nf ? ' · NF ' + esc(ult.nf) : "") + (c.fornecedor ? ' · ' + esc(c.fornecedor) : "") : 'Cancelada em ' + fmtData(c.canceladaEm)) + '</div>';
    }
    return h + '</div>';
}

/* ----- Nova solicitação ----- */
function formCompra(estId) {
    if (!podeCompras()) return;
    estId = estId || null;
    var opts = '<option value="">➕ Material novo (não cadastrado)</option>' + estoque.slice().sort(porNome).map(function (e) {
        return '<option value="' + e.id + '"' + (e.id === estId ? " selected" : "") + '>' + esc(e.nome) + ' (saldo ' + fmtQtd(saldoEstoque(e)) + ' ' + esc(e.un) + ')</option>';
    }).join("");

    var h = '<div class="sheet-alca"></div><h2>Solicitar compra</h2>' +
        '<label class="campo"><span>Material</span><select id="cpItem" onchange="aoMudarCompraItem()">' + opts + '</select></label>' +
        '<div id="cpNovo" style="display:none"><div class="linha2">' +
            '<label class="campo" id="cCpNome"><span>Nome do material *</span><input type="text" id="cpNome" maxlength="40" placeholder="Ex: Rolamento 2200"><em class="erro">Informe o nome.</em></label>' +
            '<label class="campo"><span>Unidade</span><select id="cpUn">' + optsUnidade("un") + '</select></label></div></div>' +
        '<div id="compInfo"></div>' +
        '<label class="campo" id="cCpQtd"><span>Quantidade a comprar *</span><input type="text" id="cpQtd" inputmode="decimal" maxlength="8" placeholder="Ex: 10"><em class="erro">Informe a quantidade.</em></label>' +
        '<label class="campo"><span>Observação (opcional)</span><input type="text" id="cpObs" maxlength="80" placeholder="Ex: usar o mesmo modelo da última vez"></label>' +
        '<label class="campo"><span>Prioridade</span><select id="cpPrior"><option value="normal">Normal</option><option value="urgente">Urgente</option><option value="hoje">Para hoje</option></select></label>' +
        '<div class="sheet-acoes" style="margin-top:10px">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="salvarCompra()"><i class="fa-solid fa-paper-plane"></i> Enviar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    aoMudarCompraItem();
}

// Mostra saldo, solicitação já aberta e o histórico de compras do material escolhido
function aoMudarCompraItem() {
    var sel = $("cpItem");
    if (!sel) return;
    var e = sel.value ? estItem(sel.value) : null;
    $("cpNovo").style.display = e ? "none" : "";
    var h = "";
    if (e) {
        h += '<div class="comp-info"><div class="est-sel-foto">' + estMiniatura(e) + '<span>Saldo: <b>' + fmtQtd(saldoEstoque(e)) + ' ' + esc(e.un) + '</b>' +
             (e.min ? ' · mínimo ' + fmtQtd(e.min) : "") + (locTexto(e) ? '<br>📍 ' + esc(locTexto(e)) : "") + '</span></div></div>';
        var ab = compraAberta(e.id);
        if (ab) h += '<div class="comp-aviso"><i class="fa-solid fa-triangle-exclamation"></i>Já existe uma solicitação em aberto para este material (' + esc(COMPRA_ST[ab.status].t) + ').</div>';
    }
    var nomeRef = e ? e.nome : ($("cpNome") ? $("cpNome").value.trim() : "");
    var hc = e ? comprasDoItem(e.id, e.nome, 0) : [];
    if (hc.length) {
        var u = hc[0], r = u.receb[u.receb.length - 1];
        var lev = u.compradoEm ? diasEntre(u.compradoEm, r.em) : null;
        h += '<div class="comp-hist"><b><i class="fa-solid fa-clock-rotate-left"></i> Última compra</b>' +
             '<span>' + fmtData(r.em) + ' · ' + fmtQtd(recebidoCompra(u)) + ' ' + esc(u.un) + (u.fornecedor ? ' de <b>' + esc(u.fornecedor) + '</b>' : "") + '</span>' +
             '<small>Pedida por ' + esc(nomeDe(u.por)) + ' · NF ' + esc(r.nf) + (lev != null && lev >= 0 ? ' · levou ' + lev + (lev === 1 ? ' dia' : ' dias') : "") + '</small>' +
             (hc.length > 1 ? '<small>Antes: ' + hc.slice(1, 3).map(function (x) {
                 var rr = x.receb[x.receb.length - 1];
                 return fmtData(rr.em) + ' (' + fmtQtd(recebidoCompra(x)) + ' ' + esc(x.un) + (x.fornecedor ? ', ' + esc(x.fornecedor) : "") + ')';
             }).join(" · ") + '</small>' : "") + '</div>';
    } else if (e) {
        h += '<p class="dica" style="margin:0 0 10px">Este material ainda não tem compras registradas.</p>';
    }
    $("compInfo").innerHTML = h;
    if (e) {
        var sg = sugestaoQtd(e);
        if (sg > 0 && !compraAberta(e.id)) {
            $("compInfo").innerHTML += '<div class="comp-sug"><span>Sugestão de reposição: <b>' + fmtQtd(sg) + ' ' + esc(e.un) + '</b>' +
                (e.max > 0 ? " (até o máximo de " + fmtQtd(e.max) + ")" : "") + '</span><a onclick="usarSugestao(' + sg + ')">Usar</a></div>';
            var qi = $("cpQtd");
            if (qi && !qi.value.trim()) qi.value = String(sg).replace(".", ",");
        }
    }
}

function salvarCompra() {
    if (!podeCompras()) return;
    var e = $("cpItem").value ? estItem($("cpItem").value) : null;
    var nome = e ? e.nome : $("cpNome").value.trim();
    var un = e ? e.un : $("cpUn").value;
    var qtd = lerNumero($("cpQtd").value);
    var ok = true;
    if (!nome) { $("cCpNome").classList.add("invalido"); ok = false; }
    if (!(qtd > 0)) { $("cCpQtd").classList.add("invalido"); ok = false; }
    if (!ok) return;

    var dup = e ? compraAberta(e.id) : compras.filter(function (c) { return !c.estId && compraAtiva(c) && c.nome.toLowerCase() === nome.toLowerCase(); })[0];
    var dados = {
        id: proximoId(compras), estId: e ? e.id : null, nome: nome, un: un, qtd: arred(qtd),
        obs: $("cpObs").value.trim(), prior: $("cpPrior").value, urgente: $("cpPrior").value !== "normal",
        por: sessao, em: Date.now(), status: "solicitada", receb: []
    };
    function enviar() {
        dados.id = proximoId(compras);
        compras.push(dados);
        salvar();
        fecharOS();
        renderTudo();
        toast("Solicitação enviada para a compradora ✔");
    }
    if (dup) {
        pedirConfirmacao({
            ic: "fa-copy", tipo: "azul", titulo: "Já existe um pedido aberto", sim: "Sim, criar outra", nao: "Cancelar",
            texto: 'Já existe uma solicitação em aberto para <b>' + esc(nome) + '</b>. Criar outra mesmo assim?'
        }, enviar);
        return;
    }
    enviar();
}

/* ----- Detalhe / pedido ----- */
function abrirCompra(id, marcar) {
    var c = buscarCompra(id);
    if (!c || !podeCompras()) return;

    // Só conta como visualizada quando a compradora toca na solicitação (marcar = true)
    if (marcar && ehCompras() && c.status === "solicitada") {
        c.status = "visualizada";
        c.vistaPor = sessao;
        c.vistaEm = Date.now();
        salvar();
        renderTudo();
    }

    var st = COMPRA_ST[c.status];
    var e = c.estId ? estItem(c.estId) : null;
    var ativa = compraAtiva(c);
    var ped = c.status === "solicitada" || c.status === "visualizada";
    var h = '<div class="sheet-alca"></div><h2>' + esc(c.nome) + '</h2>' +
        '<div class="linha-tags"><span class="tag ' + st.c + '">' + st.t + '</span>' + priorTag(c) + '</div>' +
        '<div class="comp-ficha">' +
            '<div class="cf-item destaque"><span>Quantidade pedida</span><b>' + fmtQtd(c.qtd) + ' ' + esc(c.un) + '</b></div>' +
            (e ? '<div class="cf-item"><span>Saldo no estoque</span><b>' + fmtQtd(saldoEstoque(e)) + ' ' + esc(e.un) + '</b>' + (e.min ? '<small>mín. ' + fmtQtd(e.min) + '</small>' : '') + '</div>'
               : '<div class="cf-item"><span>Material</span><b>Ainda não cadastrado</b></div>') +
            '<div class="cf-item"><span>Solicitada por</span><b>' + esc(nomeDe(c.por)) + '</b><small>' + fmtTs(c.em) + '</small></div>' +
            (c.obs ? '<div class="cf-item full"><span>Observação</span><b>' + esc(c.obs) + '</b></div>' : '') +
        '</div>';

    if (c.vistaEm) h += '<div class="comp-visto"><i class="fa-solid fa-eye"></i>Visualizada por ' + esc(nomeDe(c.vistaPor)) + ' · ' + fmtTs(c.vistaEm) + '</div>';
    else if (ativa) h += '<div class="comp-visto nao"><i class="fa-regular fa-eye-slash"></i>Ainda não visualizada pela compradora</div>';

    if (c.desfeitoEm && ped) h += '<div class="comp-aviso"><i class="fa-solid fa-rotate-left"></i>Voltou para não visualizado por ' + esc(nomeDe(c.desfeitoPor)) + ' em ' + fmtData(c.desfeitoEm) + '</div>';

    h += histPedidosHtml(c);

    if (ativa) {
        var hc = comprasDoItem(c.estId, c.nome, c.id);
        var ult = hc[0];
        var sugForn = c.fornecedor || (ult ? ult.fornecedor || "" : "") || (e ? e.forn || "" : "");
        var sugPrazo = c.prazo != null ? c.prazo : (ult && ult.prazo != null ? ult.prazo : "");
        h += '<h4 style="margin-top:14px">' + (ped ? "Dados do pedido" : "Dados do pedido (editar)") + '</h4>' +
            '<label class="campo"><span>Fornecedor</span><input type="text" id="cpForn" list="dlForn" maxlength="40" value="' + esc(sugForn) + '" placeholder="Quem vai fornecer"></label>' +
            '<label class="campo"><span>Chega em quantos dias?</span><input type="text" id="cpPrazo" inputmode="numeric" maxlength="3" value="' + esc(sugPrazo) + '" placeholder="Ex: 5"></label>' +
            (!c.fornecedor && sugForn ? '<p class="dica" style="margin:-4px 0 10px">Sugerido com base na última compra. Confirme ou altere.</p>' : "") +
            '<div class="sheet-acoes um"><button class="btn-pri" onclick="salvarPedido(' + c.id + ')"><i class="fa-solid fa-check"></i> ' + (ped ? "Confirmar pedido feito" : "Salvar alterações") + '</button></div>';
        if (c.status === "comprada" || c.status === "parcial") {
            h += '<div class="sheet-acoes um" style="margin-top:10px"><button class="btn-pri verde" onclick="formReceber(' + c.id + ')"><i class="fa-solid fa-box-open"></i> Receber material</button></div>';
        }
        if (c.status === "comprada") {
            h += '<div class="sheet-acoes um" style="margin-top:10px"><button class="btn-sec" onclick="confirmarAcaoCompra(' + c.id + ', \'desfazer\')"><i class="fa-solid fa-rotate-left"></i> Voltar pedido para não visualizado</button></div>';
        }
        if (ehAdmin()) h += '<div class="sheet-acoes um" style="margin-top:10px"><button class="btn-perigo" onclick="confirmarAcaoCompra(' + c.id + ', \'cancelar\')"><i class="fa-solid fa-ban"></i> Cancelar solicitação</button></div>';
    }

    if (c.receb && c.receb.length) {
        h += '<h4 style="margin-top:18px">Recebimentos</h4><div class="est-hist">' + c.receb.map(function (r) {
            return '<div><span>NF ' + esc(r.nf) + (r.falta ? ' · veio faltando' : "") + '<small>' + fmtData(r.em) + ' · ' + esc(nomeDe(r.por)) + (r.obs ? ' · ' + esc(r.obs) : "") + '</small></span>' +
                   '<span class="mais">+' + fmtQtd(r.qtd) + ' ' + esc(c.un) + '</span></div>';
        }).join("") + '</div>';
    }

    h += '<div class="sheet-acoes um" style="margin-top:14px"><button class="btn-sec" onclick="fecharOS()">Fechar</button></div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    montarDatalistForn();
}

/* Tela de confirmação dentro da própria folha (substitui o confirm() do navegador) */
function confirmarAcaoCompra(id, acao) {
    var c = buscarCompra(id);
    if (!c || !podeCompras()) return;
    var desfazer = acao === "desfazer";
    if (desfazer && c.status !== "comprada") return;
    if (!desfazer && (!ehAdmin() || !compraAtiva(c))) return;

    var h = '<div class="sheet-alca"></div>' +
        '<div class="confirma-icone ' + (desfazer ? "azul" : "perigo") + '"><i class="fa-solid ' + (desfazer ? "fa-rotate-left" : "fa-ban") + '"></i></div>' +
        '<h2 style="text-align:center">' + (desfazer ? "Voltar pedido?" : "Cancelar solicitação?") + '</h2>' +
        '<p class="confirma-texto">' + (desfazer
            ? 'O pedido de <b>' + esc(c.nome) + '</b> volta para <b>Solicitada</b> (não visualizado). Depois, é só confirmar o pedido de novo.'
            : 'A solicitação de <b>' + esc(c.nome) + '</b> será cancelada. Essa ação não pode ser desfeita.') + '</p>' +
        '<div class="sheet-acoes" style="margin-top:18px">' +
            '<button class="btn-sec" onclick="abrirCompra(' + c.id + ')">Não, voltar</button>' +
            (desfazer
                ? '<button class="btn-pri" onclick="desfazerPedido(' + c.id + ')"><i class="fa-solid fa-rotate-left"></i> Sim, voltar</button>'
                : '<button class="btn-perigo" onclick="cancelarCompra(' + c.id + ')"><i class="fa-solid fa-ban"></i> Sim, cancelar</button>') +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

/* Volta o pedido para "Solicitada" (não visualizado). Fornecedor e prazo ficam como sugestão. */
function desfazerPedido(id) {
    var c = buscarCompra(id);
    if (!c || !podeCompras() || c.status !== "comprada") return;
    c.status = "solicitada";
    delete c.vistaEm;
    delete c.vistaPor;
    delete c.previsao;
    delete c.compradoEm;
    delete c.compradoPor;
    c.desfeitoEm = hoje();
    c.desfeitoPor = sessao;
    salvar();
    fecharOS();
    renderTudo();
    toast("Pedido voltou para não visualizado");
}

function salvarPedido(id) {
    var c = buscarCompra(id);
    if (!c || !podeCompras() || !compraAtiva(c)) return;
    var forn = $("cpForn").value.trim();
    var prazo = $("cpPrazo").value.trim();
    if (!forn) { toast("Informe o fornecedor"); return; }
    if (!/^\d{1,3}$/.test(prazo)) { toast("Informe em quantos dias o material chega"); return; }
    var novo = c.status === "solicitada" || c.status === "visualizada";
    c.fornecedor = forn;
    c.prazo = Number(prazo);
    c.previsao = somaDias(c.prazo);
    if (novo) {
        c.status = "comprada";
        c.compradoEm = hoje();
        c.compradoPor = sessao;
        if (!c.vistaEm && ehCompras()) { c.vistaEm = Date.now(); c.vistaPor = sessao; }
    }
    salvar();
    fecharOS();
    renderTudo();
    toast(novo ? "Pedido registrado ✔" : "Pedido atualizado ✔");
}

function cancelarCompra(id) {
    var c = buscarCompra(id);
    if (!c || !ehAdmin()) return;
    c.status = "cancelada";
    c.canceladaEm = hoje();
    salvar();
    fecharOS();
    renderTudo();
    toast("Solicitação cancelada");
}

/* ----- Recebimento (nota fiscal) ----- */
function formReceber(id) {
    var c = buscarCompra(id);
    if (!c || !podeCompras()) return;
    var pend = arred(c.qtd - recebidoCompra(c));
    var h = '<div class="sheet-alca"></div><h2>Receber material</h2>' +
        '<div class="comp-info"><div><span>Material</span><b>' + esc(c.nome) + '</b></div>' +
        '<div><span>Pedido</span><b>' + fmtQtd(c.qtd) + ' ' + esc(c.un) + (c.fornecedor ? ' · ' + esc(c.fornecedor) : "") + '</b></div>' +
        '<div><span>Falta receber</span><b>' + fmtQtd(pend) + ' ' + esc(c.un) + '</b></div></div>' +
        '<label class="campo" id="cRecNf"><span>Nº da nota fiscal *</span><input type="text" id="recNf" maxlength="20" placeholder="Ex: 12345"><em class="erro">Informe o número da nota.</em></label>' +
        '<label class="campo" id="cRecQtd"><span>Quantidade recebida *</span><input type="text" id="recQtd" inputmode="decimal" maxlength="8" value="' + String(pend).replace(".", ",") + '" oninput="recConferir(' + c.id + ')"><em class="erro">Informe a quantidade.</em></label>' +
        '<div id="recHint"></div>' +
        '<label class="check" id="recFecharBox" style="display:none"><input type="checkbox" id="recFechar"> Encerrar a compra mesmo faltando</label>' +
        '<label class="campo"><span>Observação (opcional)</span><input type="text" id="recObs" maxlength="80" placeholder="Ex: caixa amassada, falta 1 peça"></label>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="abrirCompra(' + c.id + ')">Voltar</button>' +
            '<button class="btn-pri verde" onclick="salvarRecebimento(' + c.id + ')"><i class="fa-solid fa-check"></i> Confirmar</button>' +
        '</div>';
    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    recConferir(c.id);
}

// Confere o que chegou com o que foi pedido
function recConferir(id) {
    var c = buscarCompra(id);
    if (!c || !$("recQtd")) return;
    var pend = arred(c.qtd - recebidoCompra(c));
    var q = lerNumero($("recQtd").value);
    var box = $("recHint");
    $("recFecharBox").style.display = "none";
    if (!(q > 0)) { box.innerHTML = ""; return; }
    if (arred(q) === pend) box.innerHTML = '<div class="rec-ok"><i class="fa-solid fa-circle-check"></i>Quantidade correta</div>';
    else if (q < pend) {
        box.innerHTML = '<div class="comp-aviso"><i class="fa-solid fa-triangle-exclamation"></i>Veio faltando ' + fmtQtd(arred(pend - q)) + ' ' + esc(c.un) + '. A compra continua aberta para o restante.</div>';
        $("recFecharBox").style.display = "";
    } else box.innerHTML = '<div class="comp-aviso"><i class="fa-solid fa-triangle-exclamation"></i>Veio ' + fmtQtd(arred(q - pend)) + ' ' + esc(c.un) + ' a mais que o pedido.</div>';
}

function salvarRecebimento(id) {
    var c = buscarCompra(id);
    if (!c || !podeCompras() || !compraAtiva(c)) return;
    var nf = $("recNf").value.trim();
    var q = lerNumero($("recQtd").value);
    var ok = true;
    if (!nf) { $("cRecNf").classList.add("invalido"); ok = false; }
    if (!(q > 0)) { $("cRecQtd").classList.add("invalido"); ok = false; }
    if (!ok) return;
    q = arred(q);
    var pend = arred(c.qtd - recebidoCompra(c));
    var forcar = $("recFechar").checked && $("recFecharBox").style.display !== "none";

    // Material novo: cadastra no estoque na hora do recebimento
    var e = c.estId ? estItem(c.estId) : null;
    if (!e) e = estoque.filter(function (x) { return x.nome.toLowerCase() === c.nome.toLowerCase(); })[0];
    if (!e) {
        e = { id: proximoId(estoque), nome: c.nome, caixa: "", local: "", rua: "", lado: "", nivel: "", un: c.un, min: 0, max: 0, forn: c.fornecedor || "", qtd: 0, foto: "", mov: [] };
        estoque.push(e);
    }
    c.estId = e.id;

    e.qtd = arred(e.qtd + q);
    // o total dos locais acompanha o recebimento (entra no 1º local)
    var locaisE = locaisDe(e);
    if (locaisE.length) locaisE[0].qtd = arred((Number(locaisE[0].qtd) || 0) + q);
    if (!e.mov) e.mov = [];
    e.mov.push({ t: "entrada", qtd: q, em: hoje(), por: sessao, obs: "NF " + nf + " · compra " + num(c.id) });
    if (e.mov.length > 300) e.mov = e.mov.slice(-300);

    c.receb.push({ ts: Date.now(), em: hoje(), nf: nf, qtd: q, por: sessao, obs: $("recObs").value.trim(), falta: q < pend });
    var fecha = recebidoCompra(c) >= c.qtd || forcar;
    c.status = fecha ? "entregue" : "parcial";
    if (fecha) c.entregueEm = hoje();

    salvar();
    fecharOS();
    renderTudo();
    toast(fecha ? "Compra entregue e estoque atualizado ✔" : "Recebimento parcial registrado ✔");
}

/* ----- Contagens para os cartões do perfil ----- */
function resumoCompras() {
    var ab = compras.filter(compraAtiva);
    return {
        abertas: ab.length,
        aguardando: ab.filter(function (c) { return c.status === "solicitada" || c.status === "visualizada"; }).length,
        semVer: ab.filter(function (c) { return c.status === "solicitada"; }).length,
        caminho: ab.filter(function (c) { return c.status === "comprada" || c.status === "parcial"; }).length,
        atrasadas: ab.filter(compraAtrasada).length
    };
}

function atualizarMenuCompras() {
    var r = resumoCompras();
    var tx = r.abertas ? r.abertas + (r.abertas === 1 ? " em aberto" : " em aberto") + (r.semVer ? " · " + r.semVer + " sem visualizar" : "") + (r.atrasadas ? " · " + r.atrasadas + " atrasada" + (r.atrasadas > 1 ? "s" : "") : "") : "Solicitações, pedidos e histórico";
    document.querySelectorAll(".mcCompras").forEach(function (el) {
        el.textContent = tx;
        el.classList.toggle("alerta", r.atrasadas > 0 || (r.semVer > 0 && ehCompras()));
    });
}

/* ==========================================
   ESTOQUE PROFISSIONAL
   Reposição sugerida (solicitação em lote),
   contagem de inventário, consumo/cobertura, relatório e exportação CSV.
========================================== */
function proFolha(h) {
    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
}

// Quanto já foi pedido e ainda não chegou
function pendenteCompra(estId) {
    var t = 0;
    compras.forEach(function (c) {
        if (c.estId === estId && compraAtiva(c)) t += Math.max(0, c.qtd - recebidoCompra(c));
    });
    return arred(t);
}

// Quanto comprar para voltar ao nível ideal (máximo; sem máximo, o dobro do mínimo)
function sugestaoQtd(e) {
    var alvo = e.max > 0 ? e.max : (e.min > 0 ? e.min * 2 : 1);
    var q = alvo - saldoEstoque(e) - pendenteCompra(e.id);
    return q > 0 ? Math.ceil(q) : 0;
}

function precisaRepor(e) {
    var s = saldoEstoque(e);
    return (s <= 0 || (e.min > 0 && s <= e.min)) && !compraAberta(e.id) && sugestaoQtd(e) > 0;
}

function reposicaoLista() {
    return estoque.filter(precisaRepor).sort(function (a, b) {
        var za = saldoEstoque(a) <= 0 ? 0 : 1, zb = saldoEstoque(b) <= 0 ? 0 : 1;
        return za - zb || porNome(a, b);
    });
}

/* ----- Prioridade e histórico de pedidos ----- */
function priorTag(c) {
    if (c.prior === "hoje") return ' <span class="comp-urg hoje">PARA HOJE</span>';
    if (c.prior === "urgente") return ' <span class="comp-urg">URGENTE</span>';
    return "";
}

function prioPeso(c) {
    if (!compraAtiva(c)) return 3;
    return c.prior === "hoje" ? 0 : c.prior === "urgente" ? 1 : 2;
}

function pedidosAnteriores(c) {
    var k = c.estId ? "e" + c.estId : "n" + String(c.nome || "").toLowerCase();
    return compras.filter(function (x) {
        return x.id !== c.id && (x.estId ? "e" + x.estId : "n" + String(x.nome || "").toLowerCase()) === k;
    }).sort(function (a, b) { return b.id - a.id; });
}

function histPedidosHtml(c) {
    var l = pedidosAnteriores(c);
    var h = '<h4 style="margin-top:16px">Histórico de pedidos deste item' + (l.length ? ' (' + l.length + ')' : '') + '</h4>';
    if (!l.length) return h + '<p class="dica">Primeira solicitação deste item.</p>';
    return h + '<div class="est-hist ped-hist">' + l.slice(0, 8).map(function (x) {
        var st = COMPRA_ST[x.status], ult = (x.receb || [])[(x.receb || []).length - 1];
        var det = [fmtQtd(x.qtd) + ' ' + esc(x.un)];
        if (x.fornecedor) det.push(esc(x.fornecedor));
        if (ult) det.push('NF ' + esc(ult.nf));
        if (x.status === "entregue" && x.compradoEm && x.entregueEm) {
            var d = diasEntre(x.compradoEm, x.entregueEm);
            if (d >= 0) det.push('levou ' + d + (d === 1 ? ' dia' : ' dias'));
        }
        det.push('pedida por ' + esc(nomeDe(x.por)));
        return '<div><span>' + fmtData(iso(new Date(x.em))) + (x.status === "entregue" && x.entregueEm ? ' · entregue ' + fmtData(x.entregueEm) : '') +
               '<small>' + det.join(' · ') + '</small></span><span class="tag ' + st.c + ' mini">' + st.t + '</span></div>';
    }).join('') + '</div>' + (l.length > 8 ? '<p class="dica">Mostrando os 8 mais recentes.</p>' : '');
}

/* ----- Movimentações completas de uma peça (manuais + saídas por OS) ----- */
function movimentosDe(e) {
    var l = (e.mov || []).map(function (m) {
        // saída e ajuste já são gravados com o sinal certo
        var q = m.t === "entrada" ? m.qtd : (m.t === "ajuste" ? m.qtd : -m.qtd);
        var rot = m.t === "entrada" ? "Entrada" : m.t === "saida" ? "Saída" : "Ajuste de contagem";
        return {
            data: m.em, tipo: m.t, qtd: arred(q), por: nomeDe(m.por), origem: m.obs || "",
            tx: rot + (m.obs ? " · " + m.obs : "") + " · " + nomeDe(m.por)
        };
    });
    ordens.forEach(function (o) {
        if (o.status !== "final") return;
        var q = 0;
        (o.itens || []).forEach(function (i) { if (i.estId === e.id) q += i.qtd; });
        if (q) l.push({
            data: o.concluida || o.criada || "", tipo: "os", qtd: -q, por: nomeDe(o.tecId),
            origem: "OS " + num(o.id), tx: "OS " + num(o.id) + " · " + nomeDe(o.tecId)
        });
    });
    return l.sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
}

function consumoPeriodo(e, dias) {
    var corte = somaDias(-dias), t = 0;
    movimentosDe(e).forEach(function (m) {
        if (m.qtd < 0 && (m.tipo === "saida" || m.tipo === "os") && (m.data || "") >= corte) t += -m.qtd;
    });
    return arred(t);
}

// Quantos dias o saldo atual dura no ritmo dos últimos 90 dias
function coberturaDias(e) {
    var c = consumoPeriodo(e, 90);
    if (c <= 0) return null;
    return Math.floor(Math.max(0, saldoEstoque(e)) / (c / 90));
}

/* ----- Exportação (CSV abre direto no Excel) ----- */
function csvCel(v) {
    var s = String(v == null ? "" : v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvNum(n) { return String(n == null ? "" : n).replace(".", ","); }

function baixarCsv(nome, linhas) {
    try {
        var txt = "\ufeff" + linhas.map(function (l) { return l.map(csvCel).join(";"); }).join("\r\n");
        var blob = new Blob([txt], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nome + "-" + hoje() + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast("Arquivo gerado");
    } catch (e) {
        toast("Não foi possível exportar aqui");
    }
}

function exportarEstoqueCsv() {
    var l = [["Código", "Descrição", "Categoria", "Unidade", "Saldo", "Mínimo", "Máximo", "Fornecedor padrão", "Local", "Situação"]];
    estoque.slice().sort(porNome).forEach(function (e) {
        var s = saldoEstoque(e);
        l.push([e.codigo || "", e.nome, e.cat || "", e.un, csvNum(s), csvNum(e.min || ""), csvNum(e.max || ""),
            e.forn || "", locaisDe(e).map(locCurto).join(" | "),
            s <= 0 ? "Sem estoque" : (estBaixo(e) ? "Abaixo do mínimo" : "Normal")]);
    });
    baixarCsv("estoque", l);
}

function exportarMovCsv() {
    var rot = { entrada: "Entrada", saida: "Saída", os: "Saída (OS)", ajuste: "Ajuste" };
    var todos = [];
    estoque.forEach(function (e) { movimentosDe(e).forEach(function (m) { todos.push({ e: e, m: m }); }); });
    todos.sort(function (a, b) { return (b.m.data || "").localeCompare(a.m.data || ""); });
    var l = [["Data", "Código", "Peça", "Tipo", "Quantidade", "Unidade", "Origem / motivo", "Responsável"]];
    todos.forEach(function (x) {
        l.push([x.m.data, x.e.codigo || "", x.e.nome, rot[x.m.tipo] || x.m.tipo, csvNum(x.m.qtd), x.e.un, x.m.origem, x.m.por]);
    });
    baixarCsv("movimentacoes", l);
}

function exportarComprasCsv() {
    var l = [["Nº", "Data", "Material", "Qtd pedida", "Unidade", "Situação", "Prioridade", "Solicitante", "Fornecedor", "Previsão", "Qtd recebida", "Nota fiscal", "Entregue em"]];
    compras.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (c) {
        var ult = (c.receb || [])[(c.receb || []).length - 1];
        l.push([num(c.id), iso(new Date(c.em)), c.nome, csvNum(c.qtd), c.un, COMPRA_ST[c.status].t, ({ normal: "Normal", urgente: "Urgente", hoje: "Para hoje" })[c.prior] || "Normal",
            nomeDe(c.por), c.fornecedor || "", c.previsao || "",
            csvNum(recebidoCompra(c)), ult ? ult.nf : "", c.entregueEm || ""]);
    });
    baixarCsv("compras", l);
}

/* ----- Reposição sugerida: várias solicitações de uma vez ----- */
function abrirReposicao() {
    if (!podeCompras()) return;
    var l = reposicaoLista();
    var h = '<div class="sheet-alca"></div><h2>Reposição sugerida</h2>';
    if (!l.length) {
        h += '<p class="dica">Nenhuma peça precisa de reposição agora: tudo acima do mínimo ou já com compra em andamento.</p>' +
             '<div class="sheet-acoes um"><button class="btn-sec" onclick="fecharOS()">Fechar</button></div>';
        proFolha(h);
        return;
    }
    h += '<p class="dica" style="margin:0 0 10px">Peças zeradas ou no mínimo, sem compra em aberto. Ajuste as quantidades e desmarque o que não quer pedir.</p>' +
         '<div class="rep-lista">' + l.map(function (e) {
        var s = saldoEstoque(e);
        return '<div class="rep-linha"><label class="rep-chk"><input type="checkbox" id="repChk_' + e.id + '" checked onchange="repTotal()"></label>' +
            '<div class="rep-tx"><b>' + esc(e.nome) + '</b><small class="' + (s <= 0 ? "vermelho" : "") + '">saldo ' + fmtQtd(s) + ' ' + esc(e.un) +
            (e.min ? ' · mín. ' + fmtQtd(e.min) : "") + (e.max ? ' · máx. ' + fmtQtd(e.max) : "") +
            '</small></div>' +
            '<input type="text" class="rep-qtd" id="repQtd_' + e.id + '" inputmode="decimal" maxlength="8" value="' + sugestaoQtd(e) + '" oninput="repTotal()" aria-label="Quantidade"></div>';
    }).join("") + '</div>' +
        '<div class="sheet-acoes" style="margin-top:12px"><button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
        '<button class="btn-pri" id="repBtn" onclick="enviarReposicao()"></button></div>';
    proFolha(h);
    repTotal();
}

function repTotal() {
    var n = 0;
    reposicaoLista().forEach(function (e) {
        var chk = $("repChk_" + e.id), q = $("repQtd_" + e.id);
        if (!chk || !chk.checked || !q) return;
        var v = lerNumero(q.value);
        if (!(v > 0)) return;
        n++;
    });
    if ($("repBtn")) {
        $("repBtn").disabled = !n;
        $("repBtn").innerHTML = '<i class="fa-solid fa-paper-plane"></i> Solicitar ' + n + (n === 1 ? " item" : " itens");
    }
}

function enviarReposicao() {
    if (!podeCompras()) return;
    var n = 0;
    reposicaoLista().forEach(function (e) {
        var chk = $("repChk_" + e.id), q = $("repQtd_" + e.id);
        if (!chk || !chk.checked || !q) return;
        var v = lerNumero(q.value);
        if (!(v > 0)) return;
        compras.push({
            id: proximoId(compras), estId: e.id, nome: e.nome, un: e.un, qtd: arred(v),
            obs: "Reposição sugerida (estoque " + (saldoEstoque(e) <= 0 ? "zerado" : "no mínimo") + ")",
            prior: saldoEstoque(e) <= 0 ? "urgente" : "normal", urgente: saldoEstoque(e) <= 0,
            por: sessao, em: Date.now(), status: "solicitada", receb: []
        });
        n++;
    });
    if (!n) { toast("Nenhum item selecionado"); return; }
    salvar();
    fecharOS();
    renderTudo();
    toast(n + (n === 1 ? " solicitação enviada" : " solicitações enviadas") + " para a compradora ✔");
}

function usarSugestao(q) {
    var i = $("cpQtd");
    if (i) i.value = String(q).replace(".", ",");
}

/* ----- Contagem de inventário (ajuste com motivo e histórico) ----- */
function formContagem(id) {
    var e = estItem(id);
    if (!e || !ehAdmin()) return;
    proFolha('<div class="sheet-alca"></div><h2>Ajustar contagem</h2>' +
        '<p class="dica" style="margin:0 0 10px">' + esc(e.nome) + ' · saldo no sistema: <b>' + fmtQtd(saldoEstoque(e)) + ' ' + esc(optUnidade(e.un)) + '</b></p>' +
        '<label class="campo"><span>Quantidade contada na prateleira *</span><input type="text" id="ctQtd" inputmode="decimal" maxlength="8" placeholder="Ex: 12" oninput="contagemCalc(' + e.id + ')"></label>' +
        '<div id="ctDif"></div>' +
        '<label class="campo"><span>Motivo</span><select id="ctMotivo"><option>Inventário periódico</option><option>Perda ou avaria</option><option>Erro de lançamento</option><option>Devolução</option><option>Outro</option></select></label>' +
        '<label class="campo"><span>Observação <small class="opc">(opcional)</small></span><input type="text" id="ctObs" maxlength="40" placeholder="Ex: contagem do mês"></label>' +
        '<div class="sheet-acoes"><button class="btn-sec" onclick="abrirPeca(' + e.id + ')">Cancelar</button>' +
        '<button class="btn-pri" onclick="salvarContagem(' + e.id + ')"><i class="fa-solid fa-check"></i> Confirmar</button></div>');
    var q = $("ctQtd");
    if (q) q.focus();
}

function contagemCalc(id) {
    var e = estItem(id), box = $("ctDif");
    if (!e || !box) return;
    var v = lerNumero($("ctQtd").value);
    if (isNaN(v) || v < 0) { box.innerHTML = ""; return; }
    var d = arred(v - saldoEstoque(e));
    box.innerHTML = d === 0
        ? '<div class="rec-ok"><i class="fa-solid fa-circle-check"></i>A contagem confere com o sistema</div>'
        : '<div class="comp-aviso"><i class="fa-solid fa-triangle-exclamation"></i>Diferença de <b>' + (d > 0 ? "+" : "−") + fmtQtd(Math.abs(d)) + ' ' + esc(e.un) + '</b>' + '. O saldo será corrigido.</div>';
}

function salvarContagem(id) {
    var e = estItem(id);
    if (!e || !ehAdmin()) return;
    var cont = lerNumero($("ctQtd").value);
    if (isNaN(cont) || cont < 0) { toast("Informe a quantidade contada"); return; }
    cont = arred(cont);
    var delta = arred(cont - saldoEstoque(e));
    e.contadoEm = hoje();
    if (delta !== 0) {
        e.qtd = arred(e.qtd + delta);
        var ls = locaisDe(e);
        if (ls.length) {
            if (delta > 0) {
                ls[0].qtd = arred((Number(ls[0].qtd) || 0) + delta);
            } else {
                var resto = -delta;
                ls.forEach(function (l) {
                    var tira = Math.min(Number(l.qtd) || 0, resto);
                    l.qtd = arred((Number(l.qtd) || 0) - tira);
                    resto = arred(resto - tira);
                });
            }
        }
        if (!e.mov) e.mov = [];
        var obs = $("ctObs").value.trim();
        e.mov.push({ t: "ajuste", qtd: delta, em: hoje(), por: sessao, obs: $("ctMotivo").value + (obs ? " · " + obs : "") });
        if (e.mov.length > 300) e.mov = e.mov.slice(-300);
    }
    salvar();
    fecharOS();
    renderTudo();
    toast(delta === 0 ? "Contagem conferida ✔" : "Saldo corrigido ✔");
}

/* ----- Relatório gerencial ----- */
function abrirRelEstoque() {
    if (!ehAdmin()) return;
    var parados = 0, lista = [];
    estoque.forEach(function (e) {
        var s = saldoEstoque(e);
        if (s > 0 && consumoPeriodo(e, 180) === 0) parados++;
        lista.push({ e: e, c: consumoPeriodo(e, 90) });
    });
    var top = lista.filter(function (x) { return x.c > 0; })
        .sort(function (a, b) { return b.c - a.c; }).slice(0, 5);
    function kpiCard(rot, val, alerta) {
        return '<div class="' + (alerta ? "alerta" : "") + '"><small>' + rot + '</small><b>' + val + '</b></div>';
    }
    var h = '<div class="sheet-alca"></div><h2>Relatório de estoque</h2>' +
        '<div class="pro-kpis">' +
            kpiCard("Compras em aberto", compras.filter(compraAtiva).length) +
            kpiCard("Abaixo do mínimo", estoque.filter(estBaixo).length, estoque.filter(estBaixo).length > 0) +
            kpiCard("Estoque zerado", estoque.filter(estSaldoZero).length, estoque.filter(estSaldoZero).length > 0) +
            kpiCard("Sem saída há 180 dias", parados) +
        '</div>';
    h += '<h4 style="margin-top:16px">Mais consumidos (90 dias)</h4>' + (top.length
        ? '<div class="est-hist">' + top.map(function (x) {
            var cob = coberturaDias(x.e);
            return '<div><span>' + esc(x.e.nome) + '<small>' + (cob == null ? "" : "dura cerca de " + cob + (cob === 1 ? " dia" : " dias")) + '</small></span>' +
                   '<span><b>' + fmtQtd(x.c) + ' ' + esc(x.e.un) + '</b></span></div>';
        }).join("") + '</div>'
        : '<p class="dica">Ainda não há saídas registradas.</p>');
    h += '<h4 style="margin-top:16px">Exportar para Excel</h4>' +
        '<div class="pro-ferr">' +
            '<button class="pro-b" onclick="exportarEstoqueCsv()"><i class="fa-solid fa-file-csv"></i> Estoque</button>' +
            '<button class="pro-b" onclick="exportarMovCsv()"><i class="fa-solid fa-file-csv"></i> Movimentações</button>' +
            '<button class="pro-b" onclick="exportarComprasCsv()"><i class="fa-solid fa-file-csv"></i> Compras</button>' +
        '</div>' +
        '<div class="sheet-acoes um" style="margin-top:14px"><button class="btn-sec" onclick="fecharOS()">Fechar</button></div>';
    proFolha(h);
}

/* ==========================================
   MATERIAIS DA OS (itens retirados do almoxarifado)
========================================== */
function fmtQtd(n) {
    var v = Number(n);
    if (!isFinite(v)) return "0";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function listaItens(alvo) {
    if (alvo === "form") return formItens;
    var o = buscar(alvo);
    return o ? o.itens : null;
}

function nomeItem(i) { return i.nome || ("Caixa " + i.caixa); }

function chaveItem(i) {
    return (i.estId || "") + "|" + (i.nome || "").toLowerCase() + "|" + (i.caixa || "").toLowerCase() + "|" + i.un;
}

// Sugestões: produtos que os próprios técnicos já registraram
function historicoItens() {
    var m = {};
    ordens.concat([{ itens: formItens }]).forEach(function (o) {
        (o.itens || []).forEach(function (i) {
            if (!i.nome) return;
            var k = i.nome.toLowerCase();
            if (!m[k]) m[k] = { nome: i.nome, un: i.un, n: 0 };
            m[k].n++;
            m[k].un = i.un;
        });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
        .sort(function (a, b) { return b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"); });
}

function montarDatalist() {
    var dl = $("dlItens");
    if (dl) dl.innerHTML = historicoItens().map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("");
}

function optsUnidade(sel) {
    return UNIDADES.map(function (u) { return '<option' + (u === sel ? " selected" : "") + '>' + optUnidade(u) + "</option>"; }).join("");
}

function itensInner(alvo, arr, pode) {
    var a = "'" + alvo + "'";
    var h = '<div class="itens">';
    // preserva o que já foi digitado antes de redesenhar (só existe quando pode editar)
    var emEdicao = pode ? $("iQtd_" + alvo) : null;
    var digitado = emEdicao ? {
        est: $("iEst_" + alvo) ? $("iEst_" + alvo).value : "",
        nome: $("iNome_" + alvo) ? $("iNome_" + alvo).value : "",
        cx: $("iCx_" + alvo) ? $("iCx_" + alvo).value : "",
        qtd: emEdicao.value,
        un: $("iUn_" + alvo) ? $("iUn_" + alvo).value : "un"
    } : null;

    arr.forEach(function (it, i) {
        var sub = [];
        if (it.estId) sub.push("📦 Do estoque");
        if (it.nome && it.caixa) sub.push("Caixa " + esc(it.caixa));
        h += '<div class="item"><div class="item-tx"><b>' + esc(nomeItem(it)) + '</b>' +
             (sub.length ? '<small>' + sub.join(" · ") + '</small>' : "") + '</div>';
        if (pode) {
            h += '<div class="item-qtd">' +
                '<button type="button" onclick="mudaQtd(' + a + ',' + i + ',-1)" aria-label="Diminuir">−</button>' +
                '<span>' + fmtQtd(it.qtd) + ' ' + esc(it.un) + '</span>' +
                '<button type="button" onclick="mudaQtd(' + a + ',' + i + ',1)" aria-label="Aumentar">+</button></div>' +
                '<button type="button" class="item-x" onclick="rmItem(' + a + ',' + i + ')" aria-label="Remover">✕</button>';
        } else {
            h += '<div class="item-ro">' + fmtQtd(it.qtd) + ' ' + esc(it.un) + '</div>';
        }
        h += '</div>';
    });

    if (!arr.length && !pode) h += '<span class="sem-foto">Nenhum material registrado</span>';
    h += '</div>';

    if (pode) {
        var optsEst = "";
        if (estoque.length) {
            optsEst = '<label class="campo"><span>Item do estoque</span><select id="iEst_' + alvo + '" onchange="aoEstoque(' + a + ')">' +
                '<option value="">Outro item (digitar abaixo)</option>' +
                estoque.slice().sort(porNome).map(function (e) {
                    var sd = saldoEstoque(e);
                    return '<option value="' + e.id + '"' + (sd <= 0 ? " disabled" : "") + '>' + esc(e.nome) + (e.local ? ' · ' + esc(e.local) : "") + (e.caixa ? ' · cx ' + esc(e.caixa) : "") +
                           ' — ' + (sd <= 0 ? "sem saldo" : "saldo " + fmtQtd(sd) + " " + esc(e.un)) + '</option>';
                }).join("") +
                '</select></label><p class="dica" id="iEstDica_' + alvo + '" style="margin:-4px 0 10px"></p>';
        }
        h += '<div class="item-form">' + optsEst +
            '<div id="iManual_' + alvo + '"><div class="linha2">' +
                '<label class="campo"><span>Produto</span><input type="text" id="iNome_' + alvo + '" list="dlItens" maxlength="40" placeholder="Ex: Parafuso M6" autocomplete="off" onchange="aoNomeItem(' + a + ')" onkeydown="itemEnter(event,' + a + ')" value="' + esc(digitado ? digitado.nome : "") + '"></label>' +
                '<label class="campo"><span>Nº da caixa</span><input type="text" id="iCx_' + alvo + '" maxlength="12" placeholder="Ex: 12" autocomplete="off" onkeydown="itemEnter(event,' + a + ')" value="' + esc(digitado ? digitado.cx : "") + '"></label>' +
            '</div></div>' +
            '<div class="linha2">' +
                '<label class="campo"><span>Quantidade</span><input type="text" id="iQtd_' + alvo + '" inputmode="decimal" value="' + esc(digitado ? digitado.qtd : "1") + '" maxlength="6" onkeydown="itemEnter(event,' + a + ')"></label>' +
                '<label class="campo"><span>Unidade</span><select id="iUn_' + alvo + '">' + optsUnidade(digitado ? digitado.un : "un") + '</select></label>' +
            '</div>' +
            '<button type="button" class="btn-sec cheio" style="margin-top:0" onclick="addItem(' + a + ')"><i class="fa-solid fa-plus"></i> Adicionar item</button>' +
            '<p class="dica">' + (estoque.length ? 'Escolha um item do estoque ou, se não estiver na lista, digite o nome do produto ou o número da caixa.' : 'Informe o nome do produto ou o número da caixa (ou os dois).') + '</p>' +
        '</div>';

        // devolve o que o técnico já tinha escolhido/digitado
        if (digitado && digitado.est) {
            var se = $("iEst_" + alvo);
            if (se) { se.value = digitado.est; aoEstoque(alvo); }
        }
    }
    return h;
}

function renderItens(alvo) {
    var box = $("itensBox_" + alvo);
    var arr = listaItens(alvo);
    if (box && arr) box.innerHTML = itensInner(alvo, arr, true);
    var n = $("itensN_" + alvo);
    if (n && arr) n.textContent = arr.length;
}

function renderFormItens() { renderItens("form"); }

function itensMudaram(alvo) {
    if (alvo !== "form") { salvar(); renderTudo(); }
    renderItens(alvo);
    montarDatalist();
    var campo = $("iNome_" + alvo);   // volta o cursor para o campo de produto
    if (campo) campo.focus();
}

function itemEnter(e, alvo) {
    if (e.key === "Enter") { e.preventDefault(); addItem(alvo); }
}

function aoNomeItem(alvo) {
    var n = $("iNome_" + alvo).value.trim().toLowerCase();
    var c = historicoItens().filter(function (x) { return x.nome.toLowerCase() === n; })[0];
    if (c) $("iUn_" + alvo).value = c.un;
}

function addItem(alvo) {
    var arr = listaItens(alvo);
    if (!arr) return false;
    var selEst = $("iEst_" + alvo);
    var estId = selEst && selEst.value ? Number(selEst.value) : null;
    var nome = "", caixa = "", un;
    var qtd = lerNumero($("iQtd_" + alvo).value);

    if (estId) {
        var e = estItem(estId);
        if (!e) { toast("Item do estoque não encontrado"); return false; }
        nome = e.nome; caixa = e.caixa || ""; un = e.un;
        if (!(qtd > 0)) { toast("Informe a quantidade"); return false; }
        var disp = disponivelEstoque(estId, alvo);
        if (qtd > disp) { toast("Estoque insuficiente. Disponível: " + fmtQtd(Math.max(disp, 0)) + " " + e.un); return false; }
    } else {
        nome = $("iNome_" + alvo).value.trim();
        caixa = $("iCx_" + alvo).value.trim();
        un = $("iUn_" + alvo).value;
        if (!nome && !caixa) { toast("Informe o produto ou o número da caixa"); return false; }
        if (!(qtd > 0)) { toast("Informe a quantidade"); return false; }
    }

    var novo = { nome: nome, caixa: caixa, qtd: qtd, un: un };
    if (estId) novo.estId = estId;
    var igual = arr.filter(function (i) { return chaveItem(i) === chaveItem(novo); })[0];
    if (igual) igual.qtd = Math.round((igual.qtd + qtd) * 100) / 100;
    else arr.push(novo);

    itensMudaram(alvo);
    return true;
}

function mudaQtd(alvo, i, d) {
    var arr = listaItens(alvo);
    if (!arr || !arr[i]) return;
    var n = Math.round((arr[i].qtd + d) * 100) / 100;
    if (d > 0 && arr[i].estId && d > disponivelEstoque(arr[i].estId, alvo)) { toast("Estoque insuficiente para aumentar"); return; }
    if (n <= 0) arr.splice(i, 1); else arr[i].qtd = n;
    itensMudaram(alvo);
}

function rmItem(alvo, i) {
    var arr = listaItens(alvo);
    if (!arr) return;
    arr.splice(i, 1);
    itensMudaram(alvo);
}

function toggleBaixa(id) {
    var o = buscar(id);
    if (!o || !ehAdmin()) return;
    o.baixa = !o.baixa;
    o.baixaEm = o.baixa ? hoje() : "";
    salvar();
    abrirOS(id);
    renderTudo();
    toast(o.baixa ? "Baixa registrada ✔" : "Baixa desfeita");
}

/* ==========================================
   RELATÓRIOS (impressão / PDF)
========================================== */
var REL_TIPOS = {
    geral:      "Relatório geral de ordens de serviço",
    atrasadas:  "Relatório de ordens de serviço atrasadas",
    concluidas: "Relatório de ordens de serviço concluídas",
    materiais:  "Relatório de materiais utilizados",
    inventario:   "Inventário de estoque",
    movimentacao: "Movimentação de estoque (entradas e saídas)",
    baixo:        "Estoque abaixo do mínimo",
    zerado:       "Estoque zerado"
};
var relUlt = null;

function abrirRelatorios() {
    if (!ehAdmin()) return;
    var optsTec = '<option value="">Todos os técnicos</option>' + tecnicos().map(function (u) {
        return '<option value="' + u.id + '">' + esc(u.nome) + "</option>";
    }).join("");
    var ruas = {};
    estoque.forEach(function (e) { if (e.rua) ruas[e.rua] = 1; });
    var optsRua = '<option value="">Todas as ruas</option>' + Object.keys(ruas).sort().map(function (r) {
        return '<option value="' + r + '">Rua ' + r + "</option>";
    }).join("");

    var h = '<div class="sheet-alca"></div><h2>Gerar relatório</h2>' +
        '<label class="campo"><span>Tipo de relatório</span><select id="rTipo" onchange="aoTipoRel()">' +
            '<optgroup label="Ordens de serviço">' +
                '<option value="geral">Geral (todas as OS)</option>' +
                '<option value="atrasadas">Atrasadas</option>' +
                '<option value="concluidas">Concluídas</option>' +
                '<option value="materiais">Materiais para baixa no estoque</option>' +
            '</optgroup>' +
            '<optgroup label="Estoque">' +
                '<option value="inventario">Inventário (posição atual)</option>' +
                '<option value="movimentacao">Movimentação (entradas e saídas)</option>' +
                '<option value="baixo">Estoque abaixo do mínimo</option>' +
                '<option value="zerado">Estoque zerado</option>' +
            '</optgroup>' +
        '</select></label>' +
        '<label class="campo" id="rTecBox"><span>Técnico</span><select id="rTec">' + optsTec + '</select></label>' +
        '<label class="campo" id="rRuaBox" style="display:none"><span>Rua do almoxarifado</span><select id="rRua">' + optsRua + '</select></label>' +
        '<div class="linha2" id="rDatas">' +
            '<label class="campo"><span>De</span><input type="date" id="rDe"></label>' +
            '<label class="campo"><span>Até</span><input type="date" id="rAte"></label>' +
        '</div>' +
        '<label class="check" id="rDetBox"><input type="checkbox" id="rDet"> Detalhado (descrição, materiais e fotos de cada OS)</label>' +
        '<p class="dica" id="rDica"></p>' +
        '<div class="sheet-acoes">' +
            '<button class="btn-sec" onclick="fecharOS()">Cancelar</button>' +
            '<button class="btn-pri" onclick="gerarRelatorio()"><i class="fa-solid fa-file-lines"></i> Gerar</button>' +
        '</div>';

    $("sheet").innerHTML = h;
    $("overlay").classList.add("on");
    $("sheet").classList.add("on");
    document.body.classList.add("folha-aberta");
    aoTipoRel();
}

function dataRef(o, tipo) {
    if (tipo === "concluidas") return o.concluida || o.data || o.criada || "";
    if (tipo === "atrasadas")  return o.data || "";
    if (tipo === "materiais")  return o.concluida || o.criada || "";
    return o.criada || "";
}

function fmtDataHora(d) {
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function gerarRelatorio() {
    var tipo = $("rTipo").value;
    if (REL_EST.indexOf(tipo) !== -1) { gerarRelEstoque(tipo); return; }
    var tec = Number($("rTec").value) || 0;
    var de = $("rDe").value, ate = $("rAte").value;
    var det = $("rDet").checked && tipo !== "materiais";

    if (de && ate && de > ate) { toast("A data inicial é maior que a final"); return; }

    var lista = ordens.filter(function (o) {
        if (tec && o.tecId !== tec) return false;
        if (tipo === "atrasadas" && !atrasada(o)) return false;
        if (tipo === "concluidas" && o.status !== "final") return false;
        if (tipo === "materiais" && !(o.itens && o.itens.length)) return false;
        var r = dataRef(o, tipo);
        if ((de || ate) && !r) return false;
        if (de && r < de) return false;
        if (ate && r > ate) return false;
        return true;
    }).sort(function (a, b) {
        var ra = dataRef(a, tipo), rb = dataRef(b, tipo);
        return ra === rb ? a.id - b.id : (ra < rb ? -1 : 1);
    });

    if (!lista.length) { toast("Nenhuma OS encontrada com esses filtros"); return; }

    relUlt = { tipo: tipo, lista: lista, csv: null };

    var periodo = (de || ate) ? (de ? fmtData(de) : "início") + " a " + (ate ? fmtData(ate) : "hoje") : "Todo o período";
    var quem = tec ? nomeDe(tec) : "Todos os técnicos";
    var u = user();

    var h = '<div class="rel-cab">' +
        (empresa.logo ? '<img class="rel-logo" src="' + empresa.logo + '" alt="">' : "") +
        '<div class="rel-cab-tx"><h1>' + esc(empresa.nome || "Controle de Manutenção") + '</h1><h2>' + REL_TIPOS[tipo] + '</h2></div>' +
        '<div class="rel-meta">Emitido em ' + fmtDataHora(new Date()) + '<br>Por ' + esc(u.nome) + '</div>' +
    '</div>' +
    '<div class="rel-filtros"><span><b>Técnico:</b> ' + esc(quem) + '</span><span><b>Período:</b> ' + esc(periodo) + '</span></div>';

    h += relResumo(tipo, lista);
    h += tipo === "materiais" ? relTabelaMateriais(lista) : relTabelaOS(lista, tipo);
    if (det) h += relDetalhes(lista);

    h += '<div class="rel-assina"><div></div><span>' + esc(u.nome) + ' — ' + esc(u.funcao) + '</span></div>';

    $("relFolha").innerHTML = h;
    $("relCsv").style.display = tipo === "materiais" ? "" : "none";
    fecharOS();
    $("relTela").classList.add("on");
    $("relTela").scrollTop = 0;
}

function kpi(n, rot, cls) {
    return '<div class="rel-kpi ' + (cls || "") + '"><b>' + n + '</b><small>' + rot + '</small></div>';
}

function relResumo(tipo, lista) {
    var f = lista.filter(function (o) { return o.status === "final"; }).length;
    if (tipo === "materiais") {
        var nomes = {};
        var total = 0;
        lista.forEach(function (o) { o.itens.forEach(function (i) { nomes[chaveItem(i)] = 1; total++; }); });
var pend = lista.filter(function (o) { return !o.baixa && o.itens.some(function (i) { return !i.estId; }); }).length;
        return '<div class="rel-kpis">' + kpi(lista.length, "OS com materiais") + kpi(Object.keys(nomes).length, "Itens diferentes") +
               kpi(pend, "Baixas pendentes", pend ? "alerta" : "") + kpi(lista.length - pend, "Baixas feitas", "ok") + '</div>';
    }
    var and = lista.filter(function (o) { return o.status === "andamento"; }).length;
    var ag = lista.filter(function (o) { return o.status === "aguardando"; }).length;
    var at = lista.filter(atrasada).length;
    return '<div class="rel-kpis">' + kpi(lista.length, "Total de OS") + kpi(f, "Finalizadas", "ok") +
           kpi(and, "Em andamento") + kpi(ag, "Não iniciadas") + kpi(at, "Atrasadas", at ? "alerta" : "") + '</div>';
}

function relTabelaOS(lista, tipo) {
    var h = '<div class="rel-rolagem"><table class="rel-tab"><thead><tr>' +
        '<th>OS</th><th>Equipamento</th><th>Setor</th><th>Técnico</th><th>Tipo</th><th>Prior.</th><th>Aberta</th><th>Prazo</th><th>Concluída</th><th>Situação</th></tr></thead><tbody>';
    lista.forEach(function (o) {
        var atr = atrasada(o);
        h += '<tr' + (atr ? ' class="atr"' : "") + '>' +
            '<td>' + num(o.id) + '</td><td>' + esc(o.titulo) + '</td><td>' + esc(o.setor) + '</td><td>' + esc(nomeDe(o.tecId)) + '</td>' +
            '<td>' + esc(o.tipo) + '</td><td>' + PRIOR[o.prior].t + '</td><td>' + fmtData(o.criada) + '</td><td>' + fmtData(o.data) + '</td>' +
            '<td>' + fmtData(o.concluida) + '</td><td>' + (atr ? "Atrasada" : STAT[o.status].t) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
}

function baixaTxt(o, i) {
    if (i.estId) return o.status === "final" ? "✔ Automática (ao finalizar)" : "Baixa ao finalizar a OS";
    return o.baixa ? "✔ " + fmtData(o.baixaEm) : "Pendente";
}

function relTabelaMateriais(lista) {
    var h = '<h3 class="rel-sub">Itens por ordem de serviço</h3><div class="rel-rolagem"><table class="rel-tab"><thead><tr>' +
        '<th>OS</th><th>Equipamento</th><th>Técnico</th><th>Data</th><th>Produto</th><th>Caixa</th><th class="d">Qtd.</th><th>Un.</th><th>Baixa no estoque</th></tr></thead><tbody>';
    var tot = {};
    lista.forEach(function (o) {
        o.itens.forEach(function (i) {
            h += '<tr><td>' + num(o.id) + '</td><td>' + esc(o.titulo) + '</td><td>' + esc(nomeDe(o.tecId)) + '</td><td>' + fmtData(dataRef(o, "materiais")) + '</td>' +
                 '<td>' + esc(i.nome || "—") + '</td><td>' + esc(i.caixa || "—") + '</td><td class="d">' + fmtQtd(i.qtd) + '</td><td>' + esc(i.un) + '</td>' +
                 '<td>' + baixaTxt(o, i) + '</td></tr>';
            var k = chaveItem(i);
            if (!tot[k]) tot[k] = { nome: i.nome, caixa: i.caixa, un: i.un, qtd: 0 };
            tot[k].qtd += i.qtd;
        });
    });
    h += '</tbody></table></div>';

    var ordem = Object.keys(tot).map(function (k) { return tot[k]; })
        .sort(function (a, b) { return nomeItem(a).localeCompare(nomeItem(b), "pt-BR"); });
    h += '<h3 class="rel-sub">Total consolidado por item</h3><div class="rel-rolagem"><table class="rel-tab rel-tot"><thead><tr><th>Produto</th><th>Caixa</th><th class="d">Quantidade</th><th>Un.</th></tr></thead><tbody>' +
        ordem.map(function (t) { return '<tr><td>' + esc(t.nome || "—") + '</td><td>' + esc(t.caixa || "—") + '</td><td class="d">' + fmtQtd(t.qtd) + '</td><td>' + esc(t.un) + '</td></tr>'; }).join("") +
        '</tbody></table></div>';
    return h;
}

function relDetalhes(lista) {
    var h = '<h3 class="rel-sub">Detalhamento</h3>';
    lista.forEach(function (o) {
        var fotos = function (arr) {
            return arr.length ? '<div class="rel-fotos">' + arr.map(function (f) { return '<img src="' + f + '" alt="">'; }).join("") + '</div>' : "";
        };
        h += '<div class="rel-os"><div class="rel-os-cab"><b>OS ' + num(o.id) + ' · ' + esc(o.titulo) + '</b><span>' +
            (atrasada(o) ? "Atrasada" : STAT[o.status].t) + '</span></div>' +
            '<div class="rel-os-info">' + esc(nomeDe(o.tecId)) + ' · ' + esc(o.setor) + ' · ' + esc(o.tipo) + ' · Aberta em ' + fmtData(o.criada) +
            (o.concluida ? ' · Concluída em ' + fmtData(o.concluida) : "") + '</div>' +
            (o.desc ? '<p><b>Descrição:</b> ' + esc(o.desc) + '</p>' : "") +
            (o.rel ? '<p><b>Relatório do técnico:</b> ' + esc(o.rel) + '</p>' : "") +
            (o.itens.length ? '<p><b>Materiais:</b> ' + o.itens.map(function (i) { return esc(nomeItem(i)) + (i.nome && i.caixa ? ' [caixa ' + esc(i.caixa) + ']' : '') + ' (' + fmtQtd(i.qtd) + ' ' + esc(i.un) + ')'; }).join(", ") + '</p>' : "") +
            (o.fotos.antes.length ? '<p class="rel-fr">Antes</p>' + fotos(o.fotos.antes) : "") +
            (o.fotos.depois.length ? '<p class="rel-fr">Depois</p>' + fotos(o.fotos.depois) : "") +
        '</div>';
    });
    return h;
}

function fecharRelatorio() { $("relTela").classList.remove("on"); }

function imprimirRelatorio() {
    var antes = document.title;
    document.title = "Relatorio-" + (relUlt ? relUlt.tipo : "os") + "-" + hoje();
    window.print();
    setTimeout(function () { document.title = antes; }, 800);
}

/* ----- Relatórios de estoque ----- */
var REL_EST = ["inventario", "movimentacao", "baixo", "zerado"];

function aoTipoRel() {
    var t = $("rTipo").value, est = REL_EST.indexOf(t) !== -1;
    $("rTecBox").style.display = est ? "none" : "";
    $("rDetBox").style.display = est ? "none" : "";
    $("rRuaBox").style.display = est ? "" : "none";
    $("rDatas").style.display = (!est || t === "movimentacao") ? "" : "none";
    $("rDica").textContent = est
        ? (t === "movimentacao" ? "Mostra entradas (compras, ajustes) e saídas (OS concluídas, retiradas) dentro do período. Em branco = todo o período."
                                : "Mostra a situação do estoque neste momento, na ordem do almoxarifado (rua, lado e nível).")
        : "O período usa a data de abertura (geral), de conclusão (concluídas e materiais) ou o prazo (atrasadas). Em branco = todo o período.";
}

function relCab(tipo, filtros) {
    var u = user();
    return '<div class="rel-cab">' +
        (empresa.logo ? '<img class="rel-logo" src="' + empresa.logo + '" alt="">' : "") +
        '<div class="rel-cab-tx"><h1>' + esc(empresa.nome || "Controle de Manutenção") + '</h1><h2>' + REL_TIPOS[tipo] + '</h2></div>' +
        '<div class="rel-meta">Emitido em ' + fmtDataHora(new Date()) + '<br>Por ' + esc(u.nome) + '</div>' +
    '</div><div class="rel-filtros">' + filtros + '</div>';
}

function relTab(head, rows, dir) {
    dir = dir || [];
    return '<div class="rel-rolagem"><table class="rel-tab"><thead><tr>' + head.map(function (t, i) {
        return '<th' + (dir.indexOf(i) !== -1 ? ' class="d"' : "") + '>' + t + '</th>';
    }).join("") + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr' + (r.cls ? ' class="' + r.cls + '"' : "") + '>' + r.c.map(function (t, i) {
            return '<td' + (dir.indexOf(i) !== -1 ? ' class="d"' : "") + '>' + t + '</td>';
        }).join("") + '</tr>';
    }).join("") + '</tbody></table></div>';
}

function chaveEndereco(e) {
    var n = String(e.nivel || "").padStart(2, "0");
    return (e.rua || "~") + "|" + (e.lado || "~") + "|" + n + "|" + e.nome.toLowerCase();
}

function situacaoEst(e) {
    if (estSaldoZero(e)) return "Zerado";
    if (estBaixo(e)) return "Abaixo do mínimo";
    return "OK";
}

function movimentosEstoque(lista, de, ate) {
    var mv = [];
    lista.forEach(function (e) {
        (e.mov || []).forEach(function (m) {
            // "saida" e "ajuste" já vêm com o sinal certo; o ajuste de contagem não pode ser invertido
            var q = m.t === "entrada" ? m.qtd : (m.t === "ajuste" ? m.qtd : -m.qtd);
            mv.push({ data: m.em, e: e, qtd: arred(q), tx: motivoMov(m), por: nomeDe(m.por) });
        });
        ordens.forEach(function (o) {
            if (o.status !== "final") return;
            var q = 0;
            (o.itens || []).forEach(function (i) { if (i.estId === e.id) q += i.qtd; });
            if (q) mv.push({ data: o.concluida || o.criada || "", e: e, qtd: -arred(q), tx: "OS " + num(o.id) + " · " + o.titulo, por: nomeDe(o.tecId) });
        });
    });
    return mv.filter(function (m) {
        if ((de || ate) && !m.data) return false;
        if (de && m.data < de) return false;
        if (ate && m.data > ate) return false;
        return true;
    }).sort(function (a, b) { return a.data === b.data ? a.e.nome.localeCompare(b.e.nome, "pt-BR") : (a.data < b.data ? -1 : 1); });
}

// Texto do motivo de um movimento manual (evita "undefined" na tela)
function motivoMov(m) {
    if (m.obs) return m.obs;
    if (m.t === "entrada") return "Entrada manual";
    if (m.t === "saida") return "Saída manual";
    return "Ajuste de contagem";
}

function gerarRelEstoque(tipo) {
    var rua = $("rRua").value, de = $("rDe").value, ate = $("rAte").value;
    if (tipo === "movimentacao" && de && ate && de > ate) { toast("A data inicial é maior que a final"); return; }
    var base = estoque.filter(function (e) { return !rua || e.rua === rua; });
    var head, rows = [], dir, kp, csvHead, csvRows = [];
    var periodo = tipo === "movimentacao" && (de || ate) ? (de ? fmtData(de) : "início") + " a " + (ate ? fmtData(ate) : "hoje") : (tipo === "movimentacao" ? "Todo o período" : fmtData(hoje()));
    var endTxt = function (e) { return e.rua ? esc(locTexto(e)) : esc(e.local || "—"); };

    if (tipo === "movimentacao") {
        var mv = movimentosEstoque(base, de, ate);
        if (!mv.length) { toast("Nenhuma movimentação encontrada"); return; }
        var ent = mv.filter(function (m) { return m.qtd > 0; }).length;
        kp = kpi(mv.length, "Movimentações") + kpi(ent, "Entradas", "ok") + kpi(mv.length - ent, "Saídas");
        head = ["Data", "Material", "Localização", "Tipo", "Quantidade", "Origem / motivo", "Responsável"];
        dir = [4];
        mv.forEach(function (m) {
            rows.push({ c: [fmtData(m.data), esc(m.e.nome), endTxt(m.e), m.qtd > 0 ? "Entrada" : "Saída",
                (m.qtd > 0 ? "+" : "−") + fmtQtd(Math.abs(m.qtd)) + " " + esc(m.e.un), esc(m.tx), esc(m.por)] });
            csvRows.push([fmtData(m.data), m.e.nome, locTexto(m.e) || m.e.local || "", m.qtd > 0 ? "Entrada" : "Saída", String(Math.abs(m.qtd)).replace(".", ","), m.e.un, m.tx, m.por]);
        });
        csvHead = ["Data", "Material", "Localização", "Tipo", "Quantidade", "Unidade", "Origem / motivo", "Responsável"];
    } else if (tipo === "inventario") {
        var l = base.slice().sort(function (a, b) { return chaveEndereco(a).localeCompare(chaveEndereco(b), "pt-BR"); });
        if (!l.length) { toast("Nenhum material cadastrado"); return; }
        var nz = l.filter(estSaldoZero).length, nb = l.filter(estBaixo).length;
        kp = kpi(l.length, "Materiais") + kpi(l.length - nz - nb, "Situação OK", "ok") + kpi(nb, "Abaixo do mínimo", nb ? "alerta" : "") + kpi(nz, "Zerados", nz ? "alerta" : "");
        head = ["Material", "Rua", "Lado", "Nível", "Caixa", "Saldo", "Un.", "Mínimo", "Situação", "Contagem física"];
        dir = [5, 7];
        l.forEach(function (e) {
            var sit = situacaoEst(e);
            rows.push({ cls: sit === "OK" ? "" : "atr", c: [esc(e.nome), esc(e.rua || (e.local ? e.local : "—")), e.lado === "D" ? "Direito" : e.lado === "E" ? "Esquerdo" : "—",
                esc(e.nivel || "—"), esc(e.caixa || "—"), fmtQtd(saldoEstoque(e)), esc(e.un), e.min ? fmtQtd(e.min) : "—", sit, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"] });
            csvRows.push([e.nome, e.rua || e.local || "", e.lado === "D" ? "Direito" : e.lado === "E" ? "Esquerdo" : "", e.nivel || "", e.caixa || "", String(saldoEstoque(e)).replace(".", ","), e.un, e.min ? String(e.min).replace(".", ",") : "", sit, ""]);
        });
        csvHead = head;
    } else {
        var l2 = base.filter(tipo === "baixo" ? estBaixo : estSaldoZero).sort(function (a, b) { return chaveEndereco(a).localeCompare(chaveEndereco(b), "pt-BR"); });
        if (!l2.length) { toast(tipo === "baixo" ? "Nenhum material abaixo do mínimo" : "Nenhum material zerado"); return; }
        var comCompra = l2.filter(function (e) { return !!compraAberta(e.id); }).length;
        kp = kpi(l2.length, tipo === "baixo" ? "Abaixo do mínimo" : "Zerados", "alerta") + kpi(comCompra, "Com compra em aberto", "ok") + kpi(l2.length - comCompra, "Sem solicitação", l2.length - comCompra ? "alerta" : "");
        head = ["Material", "Localização", "Caixa", "Saldo", "Mínimo", "Falta para o mínimo", "Compra"];
        dir = [3, 4, 5];
        l2.forEach(function (e) {
            var s = saldoEstoque(e), falta = e.min > s ? arred(e.min - s) : 0, cp = compraAberta(e.id);
            rows.push({ c: [esc(e.nome), endTxt(e), esc(e.caixa || "—"), fmtQtd(Math.max(s, 0)) + " " + esc(e.un), e.min ? fmtQtd(e.min) : "—",
                falta ? fmtQtd(falta) + " " + esc(e.un) : "—", cp ? esc(COMPRA_ST[cp.status].t) : "Sem solicitação"] });
            csvRows.push([e.nome, locTexto(e) || e.local || "", e.caixa || "", String(Math.max(s, 0)).replace(".", ","), e.un, e.min ? String(e.min).replace(".", ",") : "", falta ? String(falta).replace(".", ",") : "", cp ? COMPRA_ST[cp.status].t : "Sem solicitação"]);
        });
        csvHead = ["Material", "Localização", "Caixa", "Saldo", "Unidade", "Mínimo", "Falta para o mínimo", "Compra"];
    }

    relUlt = { tipo: tipo, lista: [], csv: { nome: tipo, head: csvHead, rows: csvRows } };
    var u = user();
    var h = relCab(tipo, '<span><b>' + (tipo === "movimentacao" ? "Período" : "Posição") + ':</b> ' + esc(periodo) + '</span><span><b>Rua:</b> ' + (rua ? "Rua " + rua : "Todas") + '</span>') +
        '<div class="rel-kpis">' + kp + '</div>' + relTab(head, rows, dir) +
        '<div class="rel-assina"><div></div><span>' + esc(u.nome) + ' — ' + esc(u.funcao) + '</span></div>';

    $("relFolha").innerHTML = h;
    $("relCsv").style.display = "";
    fecharOS();
    $("relTela").classList.add("on");
    $("relTela").scrollTop = 0;
}

function baixarCSV() {
    if (!relUlt) return;
    var cel = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var linhas, nome;
    if (relUlt.csv) {
        linhas = [relUlt.csv.head.map(cel).join(";")].concat(relUlt.csv.rows.map(function (r) { return r.map(cel).join(";"); }));
        nome = relUlt.csv.nome;
    } else {
        nome = "materiais";
        linhas = [["OS", "Equipamento", "Setor", "Técnico", "Data", "Produto", "Nº da caixa", "Quantidade", "Unidade", "Baixa no estoque"].map(cel).join(";")];
        relUlt.lista.forEach(function (o) {
            o.itens.forEach(function (i) {
                linhas.push([num(o.id), o.titulo, o.setor, nomeDe(o.tecId), fmtData(dataRef(o, "materiais")), i.nome || "", i.caixa || "",
                    String(i.qtd).replace(".", ","), i.un, baixaTxt(o, i).replace("✔ ", "")].map(cel).join(";"));
            });
        });
    }
    try {
        var blob = new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nome + "-" + hoje() + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) { toast("Não foi possível gerar a planilha aqui"); }
}

/* ==========================================
   INICIALIZAÇÃO
========================================== */
document.querySelectorAll("#segPrior button").forEach(function (b) {
    b.addEventListener("click", function () { setPrior(b.getAttribute("data-p")); });
});

$("fTitulo").addEventListener("input", function () { $("cTitulo").classList.remove("invalido"); });
$("fileFoto").addEventListener("change", aoEscolherFotos);
$("fileAvatar").addEventListener("change", aoEscolherAvatar);
$("fileLogo").addEventListener("change", aoEscolherLogo);
$("fileEstFoto").addEventListener("change", aoEscolherEstFoto);
$("pinInput").addEventListener("keydown", function (e) { if (e.key === "Enter") entrar(); });

setInterval(atualizarRelogio, 1000);

// Reavalia os avisos a cada minuto (e ao voltar para o app)
setInterval(function () {
    if (user()) { atualizarSino(); notificarSistema(); }
}, 60000);

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && user()) { renderTudo(); notificarSistema(); }
});

abrirDB().then(function () {
    return sbCarregar();
}).then(function (r) {
    ordens = r[0] || null;
    usuarios = r[1] || null;
    setores = r[2] || null;
    eventos = r[3] || null;
    avisos = r[4] || [];
    empresa = r[5] || { nome: "", logo: "" };
    estoque = r[6] || [];
    compras = r[7] || [];

    if (!ordens || !usuarios) {
        dadosIniciais();
    }
    normalizar();
    salvar();

    var s = 0;
    try { s = Number(localStorage.getItem("mc_sessao")); } catch (e) {}

    if (s && userPorId(s)) {
        iniciarSessao(s);
    } else {
        mostrarLogin();
    }
});
