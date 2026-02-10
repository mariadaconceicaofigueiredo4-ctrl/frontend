const CONFIG = {
  API_URL: "https://blaze-backend-nxu0.onrender.com",
  REFRESH_INTERVAL: 500
};


let historicoLocal = [];
let historicoCompleto = [];
let horariosPermitidos = [];
let filtroHorariosAtivo = false;
let ultimoIdProcessado = 0;
let dadosAnalise = null;
let primeiraExecucao = true; // NOVO: Flag para primeira execução

// ===== NAVEGAÇÃO =====
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const targetPage = document.getElementById(btn.dataset.page);
        if (targetPage) {
            targetPage.classList.add("active");
            if (btn.dataset.page === "historico") carregarHistorico();
            else if (btn.dataset.page === "horarios") atualizarStatusHorarios();
            else if (btn.dataset.page === "analise") carregarAnalise30Dias();
        }
    };
});

// ===== ANÁLISE 30 DIAS =====
async function carregarAnalise30Dias() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/relatorio/30-dias`);
        if (!response.ok) throw new Error('Erro ao carregar relatório');
        dadosAnalise = await response.json();
        renderizarAnalise(dadosAnalise);
    } catch (error) {
        console.error('Erro ao carregar análise:', error);
        exibirAlerta('Erro ao carregar análise de 30 dias');
    }
}

async function aplicarFiltrosAnalise() {
    const periodo = parseInt(document.getElementById('periodo-analise')?.value || 30);
    const horaInicio = document.getElementById('hora-inicio-filtro')?.value;
    const horaFim = document.getElementById('hora-fim-filtro')?.value;
    const tipoResultado = document.getElementById('tipo-resultado-filtro')?.value;
    try {
        if (horaInicio && horaFim) {
            const dataInicio = new Date();
            dataInicio.setDate(dataInicio.getDate() - periodo);
            const payload = {
                data_inicio: dataInicio.toISOString().split('T')[0],
                data_fim: new Date().toISOString().split('T')[0],
                hora_inicio: horaInicio,
                hora_fim: horaFim,
                tipo_resultado: tipoResultado || null
            };
            const response = await fetch(`${CONFIG.API_URL}/historico/filtrado`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Erro ao aplicar filtros');
            const dados = await response.json();
            renderizarResultadosFiltrados(dados);
        } else {
            const response = await fetch(`${CONFIG.API_URL}/estatisticas/por-horario?dias=${periodo}`);
            if (!response.ok) throw new Error('Erro ao carregar estatísticas');
            const dados = await response.json();
            renderizarEstatisticasPorHorario(dados, tipoResultado);
        }
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
        exibirAlerta('Erro ao aplicar filtros');
    }
}

function renderizarAnalise(dados) {
    document.getElementById('resumo-total').textContent = dados.resumo.total_jogadas || 0;
    document.getElementById('resumo-wins').textContent = dados.resumo.total_wins || 0;
    document.getElementById('resumo-losses').textContent = dados.resumo.total_losses || 0;
    document.getElementById('resumo-taxa').textContent = `${dados.resumo.taxa_acerto_geral}%`;
    const semLossContainer = document.getElementById('horarios-sem-loss');
    const badgeSemLoss = document.getElementById('badge-sem-loss');
    const semLossVazio = document.getElementById('sem-loss-vazio');
    if (dados.horarios_sem_loss && dados.horarios_sem_loss.length > 0) {
        badgeSemLoss.textContent = `${dados.horarios_sem_loss.length} horário${dados.horarios_sem_loss.length !== 1 ? 's' : ''}`;
        semLossVazio.style.display = 'none';
        semLossContainer.style.display = 'grid';
        semLossContainer.innerHTML = '';
        dados.horarios_sem_loss.forEach(h => {
            const card = criarCardHorarioPerformance(h, 'sem-loss');
            semLossContainer.appendChild(card);
        });
    } else {
        badgeSemLoss.textContent = '0 horários';
        semLossVazio.style.display = 'block';
        semLossContainer.style.display = 'none';
    }
    const top10Container = document.getElementById('top-10-horarios');
    top10Container.innerHTML = '';
    if (dados.top_10_menor_loss && dados.top_10_menor_loss.length > 0) {
        dados.top_10_menor_loss.forEach((h, index) => {
            const card = criarCardRanking(h, index + 1);
            top10Container.appendChild(card);
        });
    }
    renderizarTabelaEstatisticas(dados.estatisticas_completas || []);
}

function renderizarEstatisticasPorHorario(dados, filtroTipo) {
    let estatisticas = dados.estatisticas_por_horario || [];
    if (filtroTipo === 'win') estatisticas = estatisticas.filter(e => e.wins > 0);
    else if (filtroTipo === 'loss') estatisticas = estatisticas.filter(e => e.losses > 0);
    document.getElementById('resumo-total').textContent = dados.total_jogadas || 0;
    document.getElementById('resumo-wins').textContent = dados.total_wins || 0;
    document.getElementById('resumo-losses').textContent = dados.total_losses || 0;
    document.getElementById('resumo-taxa').textContent = `${dados.taxa_acerto_geral}%`;
    const horariosSemLoss = estatisticas.filter(e => e.losses === 0 && e.total >= 5);
    const semLossContainer = document.getElementById('horarios-sem-loss');
    const badgeSemLoss = document.getElementById('badge-sem-loss');
    const semLossVazio = document.getElementById('sem-loss-vazio');
    if (horariosSemLoss.length > 0) {
        badgeSemLoss.textContent = `${horariosSemLoss.length} horário${horariosSemLoss.length !== 1 ? 's' : ''}`;
        semLossVazio.style.display = 'none';
        semLossContainer.style.display = 'grid';
        semLossContainer.innerHTML = '';
        horariosSemLoss.forEach(h => {
            const card = criarCardHorarioPerformance(h, 'sem-loss');
            semLossContainer.appendChild(card);
        });
    } else {
        badgeSemLoss.textContent = '0 horários';
        semLossVazio.style.display = 'block';
        semLossContainer.style.display = 'none';
    }
    const top10 = [...estatisticas].filter(e => e.total >= 5).sort((a, b) => {
        const taxaLossA = a.losses / a.total;
        const taxaLossB = b.losses / b.total;
        return taxaLossA - taxaLossB || b.taxa_acerto - a.taxa_acerto;
    }).slice(0, 10);
    const top10Container = document.getElementById('top-10-horarios');
    top10Container.innerHTML = '';
    top10.forEach((h, index) => {
        const card = criarCardRanking(h, index + 1);
        top10Container.appendChild(card);
    });
    renderizarTabelaEstatisticas(estatisticas);
}

function renderizarResultadosFiltrados(dados) {
    document.getElementById('resumo-total').textContent = dados.total || 0;
    document.getElementById('resumo-wins').textContent = dados.wins || 0;
    document.getElementById('resumo-losses').textContent = dados.losses || 0;
    document.getElementById('resumo-taxa').textContent = `${dados.taxa_acerto}%`;
    const porHorario = {};
    dados.resultados.forEach(r => {
        if (!r.hora || r.hora === '??:??' || r.hora === '--:--') return;
        const horaKey = r.hora.split(':')[0] + ':00';
        if (!porHorario[horaKey]) porHorario[horaKey] = { horario: horaKey, wins: 0, losses: 0, total: 0 };
        porHorario[horaKey].total++;
        if (r.resultado === 'WIN') porHorario[horaKey].wins++;
        if (r.resultado === 'LOSS') porHorario[horaKey].losses++;
    });
    const estatisticas = Object.values(porHorario).map(h => ({ ...h, taxa_acerto: h.total > 0 ? ((h.wins / h.total) * 100).toFixed(2) : 0 }));
    const horariosSemLoss = estatisticas.filter(e => e.losses === 0 && e.total >= 3);
    const semLossContainer = document.getElementById('horarios-sem-loss');
    const badgeSemLoss = document.getElementById('badge-sem-loss');
    const semLossVazio = document.getElementById('sem-loss-vazio');
    if (horariosSemLoss.length > 0) {
        badgeSemLoss.textContent = `${horariosSemLoss.length} horário${horariosSemLoss.length !== 1 ? 's' : ''}`;
        semLossVazio.style.display = 'none';
        semLossContainer.style.display = 'grid';
        semLossContainer.innerHTML = '';
        horariosSemLoss.forEach(h => {
            const card = criarCardHorarioPerformance(h, 'sem-loss');
            semLossContainer.appendChild(card);
        });
    } else {
        badgeSemLoss.textContent = '0 horários';
        semLossVazio.style.display = 'block';
        semLossContainer.style.display = 'none';
    }
    const top10 = [...estatisticas].sort((a, b) => {
        const taxaLossA = a.losses / a.total;
        const taxaLossB = b.losses / b.total;
        return taxaLossA - taxaLossB || b.taxa_acerto - a.taxa_acerto;
    }).slice(0, 10);
    const top10Container = document.getElementById('top-10-horarios');
    top10Container.innerHTML = '';
    top10.forEach((h, index) => {
        const card = criarCardRanking(h, index + 1);
        top10Container.appendChild(card);
    });
    renderizarTabelaEstatisticas(estatisticas);
}

function criarCardHorarioPerformance(horario, tipo) {
    const card = document.createElement('div');
    card.className = `horario-performance-card ${tipo}`;
    const taxaAcerto = parseFloat(horario.taxa_acerto);
    const corBarra = taxaAcerto >= 80 ? '#00b09b' : taxaAcerto >= 60 ? '#f5af19' : '#ff416c';
    card.innerHTML = `<div class="performance-header"><div class="performance-time"><i class="fa-solid fa-clock"></i><span>${horario.horario}</span></div><div class="performance-badge ${tipo}"><i class="fa-solid fa-crown"></i>100% WIN</div></div><div class="performance-stats"><div class="stat"><span class="stat-label">Total</span><span class="stat-value">${horario.total}</span></div><div class="stat win"><span class="stat-label">WINS</span><span class="stat-value">${horario.wins}</span></div><div class="stat loss"><span class="stat-label">LOSS</span><span class="stat-value">${horario.losses}</span></div></div><div class="performance-bar"><div class="bar-fill" style="width: ${taxaAcerto}%; background: ${corBarra};"></div></div><div class="performance-rate">${taxaAcerto}% Taxa de Acerto</div>`;
    return card;
}

function criarCardRanking(horario, posicao) {
    const card = document.createElement('div');
    card.className = 'ranking-card';
    const taxaAcerto = parseFloat(horario.taxa_acerto);
    const taxaLoss = horario.total > 0 ? ((horario.losses / horario.total) * 100).toFixed(1) : 0;
    let medalIcon = '';
    if (posicao === 1) medalIcon = '<i class="fa-solid fa-trophy" style="color: #ffd700;"></i>';
    else if (posicao === 2) medalIcon = '<i class="fa-solid fa-medal" style="color: #c0c0c0;"></i>';
    else if (posicao === 3) medalIcon = '<i class="fa-solid fa-medal" style="color: #cd7f32;"></i>';
    else medalIcon = `<span class="posicao-numero">${posicao}</span>`;
    card.innerHTML = `<div class="ranking-posicao">${medalIcon}</div><div class="ranking-horario"><i class="fa-solid fa-clock"></i> ${horario.horario}</div><div class="ranking-stats"><span class="ranking-total">${horario.total} jogadas</span><span class="ranking-win" style="color: #00b09b;">${horario.wins} W</span><span class="ranking-loss" style="color: #ff416c;">${horario.losses} L</span></div><div class="ranking-taxa"><div class="taxa-label">Win Rate</div><div class="taxa-value" style="color: ${taxaAcerto >= 70 ? '#00b09b' : '#f5af19'};">${taxaAcerto}%</div></div><div class="ranking-loss-rate"><div class="loss-label">Loss Rate</div><div class="loss-value">${taxaLoss}%</div></div>`;
    return card;
}

function renderizarTabelaEstatisticas(estatisticas) {
    const tbody = document.getElementById('tabela-estatisticas-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const estatisticasOrdenadas = [...estatisticas].sort((a, b) => a.horario.localeCompare(b.horario));
    estatisticasOrdenadas.forEach(h => {
        const tr = document.createElement('tr');
        const taxaAcerto = parseFloat(h.taxa_acerto);
        let performanceClass = 'performance-excelente';
        let performanceText = 'Excelente';
        if (taxaAcerto < 50) { performanceClass = 'performance-ruim'; performanceText = 'Ruim'; }
        else if (taxaAcerto < 70) { performanceClass = 'performance-media'; performanceText = 'Média'; }
        else if (taxaAcerto < 85) { performanceClass = 'performance-boa'; performanceText = 'Boa'; }
        if (h.losses === 0 && h.total >= 5) { performanceClass = 'performance-perfeita'; performanceText = 'Perfeita'; }
        tr.innerHTML = `<td><strong>${h.horario}</strong></td><td>${h.total}</td><td class="cell-win">${h.wins}</td><td class="cell-loss">${h.losses}</td><td><strong>${taxaAcerto}%</strong></td><td><span class="performance-badge ${performanceClass}">${performanceText}</span></td>`;
        tbody.appendChild(tr);
    });
}

function limparFiltrosAnalise() {
    document.getElementById('periodo-analise').value = '30';
    document.getElementById('hora-inicio-filtro').value = '';
    document.getElementById('hora-fim-filtro').value = '';
    document.getElementById('tipo-resultado-filtro').value = '';
    carregarAnalise30Dias();
}

function exportarCSV() {
    const tabela = document.getElementById('tabela-estatisticas');
    if (!tabela) return;
    let csv = 'Horário,Total,WINS,LOSS,Taxa Win (%),Performance\n';
    const linhas = tabela.querySelectorAll('tbody tr');
    linhas.forEach(tr => {
        const colunas = tr.querySelectorAll('td');
        const linha = Array.from(colunas).map(td => td.textContent.trim()).join(',');
        csv += linha + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `analise_horarios_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    exibirAlerta('✓ CSV exportado com sucesso!');
}

// ===== LOCALSTORAGE =====
function salvarHistoricoLocal() {
    try {
        localStorage.setItem('blazeHunters_historicoLocal', JSON.stringify(historicoLocal));
        localStorage.setItem('blazeHunters_ultimoId', ultimoIdProcessado.toString());
        console.log(`💾 Histórico salvo: ${historicoLocal.length} resultados | Último ID: ${ultimoIdProcessado}`);
    } catch (error) {
        console.error('Erro ao salvar histórico:', error);
    }
}

function carregarHistoricoLocal() {
    try {
        const ultimoId = localStorage.getItem('blazeHunters_ultimoId');
        const salvos = localStorage.getItem('blazeHunters_historicoLocal');
        
        // IMPORTANTE: Carregar o último ID PRIMEIRO
        if (ultimoId) {
            ultimoIdProcessado = parseInt(ultimoId);
            console.log(`📍 Último ID recuperado do localStorage: ${ultimoIdProcessado}`);
        } else {
            console.log(`⚠️ Nenhum ID anterior encontrado, iniciando do zero`);
            ultimoIdProcessado = 0;
        }
        
        if (salvos) {
            historicoLocal = JSON.parse(salvos);
            console.log(`📂 Histórico carregado: ${historicoLocal.length} resultados`);
            
            // Verificar se há inconsistência e ajustar o último ID
            if (historicoLocal.length > 0 && historicoLocal[0].timestamp_recebimento) {
                const maiorIdLocal = Math.max(...historicoLocal.map(h => h.timestamp_recebimento || 0));
                if (maiorIdLocal > ultimoIdProcessado) {
                    console.log(`🔧 Ajustando último ID de ${ultimoIdProcessado} para ${maiorIdLocal}`);
                    ultimoIdProcessado = maiorIdLocal;
                }
            }
            
            renderizarUltimos3();
            renderizarResultados();
        } else {
            console.log(`📂 Nenhum histórico local encontrado`);
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        historicoLocal = [];
        ultimoIdProcessado = 0;
    }
}

function atualizarEstatisticasConfig() {
    const totalHistorico = document.getElementById('config-total-historico');
    if (totalHistorico) totalHistorico.textContent = `${historicoLocal.length} resultado${historicoLocal.length !== 1 ? 's' : ''}`;
    const totalHorarios = document.getElementById('config-total-horarios');
    if (totalHorarios) totalHorarios.textContent = `${horariosPermitidos.length} horário${horariosPermitidos.length !== 1 ? 's' : ''}`;
    console.log('📊 Estatísticas atualizadas');
}

// ===== HORÁRIOS =====
document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const btnUpload = document.getElementById('btnUpload');
    const btnLimpar = document.getElementById('btnLimparHorarios');
    const btnReload = document.getElementById("btn-reload-historico");
    const btnAtualizarStats = document.getElementById('btnAtualizarStats');
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    const btnLimparFiltros = document.getElementById('btn-limpar-filtros');
    const btnExportarCSV = document.getElementById('btn-exportar-csv');
    
    if (btnUpload) btnUpload.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = (e) => { const file = e.target.files[0]; if (file) processarArquivoHorarios(file); };
    if (uploadArea) {
        uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); };
        uploadArea.ondragleave = () => uploadArea.classList.remove('drag-over');
        uploadArea.ondrop = (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.txt')) processarArquivoHorarios(file);
            else exibirAlerta('Por favor, envie um arquivo .txt');
        };
    }
    if (btnLimpar) {
        btnLimpar.onclick = async () => {
            if (confirm('Tem certeza que deseja limpar todos os horários?')) {
                horariosPermitidos = [];
                filtroHorariosAtivo = false;
                localStorage.removeItem('blazeHunters_horariosPermitidos');
                await enviarHorariosParaAPI([], false);
                atualizarStatusHorarios();
                exibirAlerta('Horários limpos com sucesso!');
                console.log('🗑️ Horários limpos do localStorage e API');
            }
        };
    }
    if (btnReload) btnReload.onclick = () => carregarHistorico();
    if (btnAtualizarStats) btnAtualizarStats.onclick = () => atualizarEstatisticasConfig();
    if (btnAplicarFiltros) btnAplicarFiltros.onclick = () => aplicarFiltrosAnalise();
    if (btnLimparFiltros) btnLimparFiltros.onclick = () => limparFiltrosAnalise();
    if (btnExportarCSV) btnExportarCSV.onclick = () => exportarCSV();
    
    // Carregar dados na ordem correta
    carregarHorariosSalvos();
    carregarHistoricoLocal();
    
    const configNavBtn = document.querySelector('[data-page="configuracoes"]');
    if (configNavBtn) configNavBtn.addEventListener('click', () => setTimeout(() => atualizarEstatisticasConfig(), 100));
});

function processarArquivoHorarios(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const conteudo = e.target.result;
            const linhas = conteudo.split('\n');
            const horariosNovos = [];
            linhas.forEach(linha => {
                const horario = linha.trim();
                if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(horario)) horariosNovos.push(horario);
            });
            if (horariosNovos.length === 0) {
                exibirAlerta('Nenhum horário válido encontrado no arquivo');
                return;
            }
            horariosNovos.sort();
            horariosPermitidos = horariosNovos;
            filtroHorariosAtivo = true;
            localStorage.setItem('blazeHunters_horariosPermitidos', JSON.stringify(horariosPermitidos));
            enviarHorariosParaAPI(horariosNovos, true);
            atualizarStatusHorarios();
            exibirAlerta(`✓ ${horariosNovos.length} horário(s) carregado(s) com sucesso!`);
            console.log(`⏰ ${horariosNovos.length} horários importados e salvos`);
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            exibirAlerta('Erro ao processar o arquivo. Verifique o formato.');
        }
    };
    reader.readAsText(file);
}

async function enviarHorariosParaAPI(horarios, ativo) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/horarios/configurar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ horarios: horarios, ativo: ativo })
        });
        if (response.ok) {
            const data = await response.json();
            console.log(`📡 Horários enviados para API: ${data.total} horários`);
        } else {
            console.warn('⚠️ Falha ao enviar horários para API');
        }
    } catch (error) {
        console.warn('⚠️ API não disponível - horários salvos apenas localmente');
    }
}

function carregarHorariosSalvos() {
    const salvos = localStorage.getItem('blazeHunters_horariosPermitidos');
    if (salvos) {
        try {
            horariosPermitidos = JSON.parse(salvos);
            filtroHorariosAtivo = horariosPermitidos.length > 0;
            if (filtroHorariosAtivo) enviarHorariosParaAPI(horariosPermitidos, true);
            atualizarStatusHorarios();
            console.log(`⏰ Horários carregados: ${horariosPermitidos.length} horários`);
        } catch (error) {
            console.error('Erro ao carregar horários salvos:', error);
        }
    }
}

function atualizarStatusHorarios() {
    const statusBadge = document.getElementById('filtroStatus');
    const statusText = document.getElementById('filtroStatusText');
    if (statusBadge && statusText) {
        if (filtroHorariosAtivo && horariosPermitidos.length > 0) {
            statusBadge.classList.remove('inactive');
            statusBadge.classList.add('active');
            statusText.textContent = 'ATIVO';
        } else {
            statusBadge.classList.remove('active');
            statusBadge.classList.add('inactive');
            statusText.textContent = 'INATIVO';
        }
    }
    const totalHorarios = document.getElementById('totalHorarios');
    const proximoHorario = document.getElementById('proximoHorario');
    const filtroAtivo = document.getElementById('filtroAtivo');
    if (totalHorarios) totalHorarios.textContent = horariosPermitidos.length;
    if (proximoHorario) {
        const proximo = obterProximoHorario();
        proximoHorario.textContent = proximo || '--:--';
    }
    if (filtroAtivo) filtroAtivo.textContent = filtroHorariosAtivo ? 'Ativado' : 'Desativado';
    renderizarListaHorarios();
}

function obterProximoHorario() {
    if (horariosPermitidos.length === 0) return null;
    const agora = new Date();
    const horaAtual = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
    for (let horario of horariosPermitidos) {
        if (horario > horaAtual) return horario;
    }
    return horariosPermitidos[0];
}

function verificarHorarioPermitido() {
    if (!filtroHorariosAtivo || horariosPermitidos.length === 0) return true;
    const agora = new Date();
    const horaAtual = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
    return horariosPermitidos.includes(horaAtual);
}

function renderizarListaHorarios() {
    const container = document.getElementById('horariosListContainer');
    const grid = document.getElementById('horariosGrid');
    const listCount = document.getElementById('listCount');
    if (!container || !grid) return;
    if (horariosPermitidos.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    grid.innerHTML = '';
    if (listCount) listCount.textContent = `${horariosPermitidos.length} horário${horariosPermitidos.length !== 1 ? 's' : ''}`;
    const agora = new Date();
    const horaAtual = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
    horariosPermitidos.forEach(horario => {
        const item = document.createElement('div');
        item.className = 'horario-item';
        item.textContent = horario;
        if (horario === horaAtual) item.classList.add('active');
        grid.appendChild(item);
    });
}

function obterHoraLocal() {
    const agora = new Date();
    return `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
}

// ===== RENDERIZAÇÃO =====
function criarBolinha(numero, cor) {
    const wrapper = document.createElement("div");
    wrapper.className = "ball-wrapper";
    const ball = document.createElement("div");
    ball.className = `ball ${cor}`;
    ball.textContent = numero;
    ball.style.animation = "bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55)";
    wrapper.appendChild(ball);
    return wrapper;
}

function renderizarUltimos3() {
    const container = document.getElementById("ultimas-bolinhas");
    if (!container) return;
    container.innerHTML = "";
    const ultimos = historicoLocal.slice(0, 3);
    ultimos.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "ball-wrapper-large";
        const ball = document.createElement("div");
        ball.className = `ball ${item.cor}`;
        ball.style.width = "60px";
        ball.style.height = "60px";
        ball.style.fontSize = "1.5rem";
        ball.textContent = item.numero;
        const timeDiv = document.createElement("div");
        timeDiv.className = "ball-time-large";
        timeDiv.textContent = item.hora || "??:??";
        wrapper.appendChild(ball);
        wrapper.appendChild(timeDiv);
        container.appendChild(wrapper);
    });
}

function renderizarResultados() {
    const grid = document.getElementById("grid-resultados");
    if (!grid) return;
    grid.innerHTML = "";
    historicoLocal.forEach((item, index) => {
        const wrapper = criarBolinha(item.numero, item.cor);
        wrapper.style.animationDelay = `${index * 0.01}s`;
        const timeDiv = document.createElement("div");
        timeDiv.className = "ball-time";
        timeDiv.textContent = item.hora && item.hora !== "??:??" ? item.hora : "--:--";
        wrapper.appendChild(timeDiv);
        grid.appendChild(wrapper);
    });
}

async function carregarHistorico() {
    const loadingState = document.getElementById("historico-loading");
    const errorState = document.getElementById("historico-error");
    const contentState = document.getElementById("historico-content");
    if (loadingState) loadingState.style.display = "block";
    if (errorState) errorState.style.display = "none";
    if (contentState) contentState.style.display = "none";
    try {
        const res = await fetch(`${CONFIG.API_URL}/results/historico`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        historicoCompleto = data;
        if (loadingState) loadingState.style.display = "none";
        if (contentState) contentState.style.display = "block";
        renderizarHistoricoCompleto();
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        if (loadingState) loadingState.style.display = "none";
        if (errorState) errorState.style.display = "block";
    }
}

function renderizarHistoricoCompleto() {
    const grid = document.getElementById("historico-grid");
    const totalElement = document.getElementById("total-historico");
    if (!grid) return;
    grid.innerHTML = "";
    if (totalElement) totalElement.innerText = `${historicoCompleto.length} resultado${historicoCompleto.length !== 1 ? 's' : ''}`;
    historicoCompleto.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "historico-item";
        card.style.animationDelay = `${index * 0.01}s`;
        const numero = item.numero !== undefined ? item.numero : '--';
        const cor = item.cor || 'black';
        let horaExibida = item.hora && item.hora !== "??:??" ? item.hora : "--:--";
        card.innerHTML = `<div class="historico-ball-wrapper"><div class="ball ${cor}">${numero}</div></div><div class="historico-info-wrapper"><div class="historico-number">#${historicoCompleto.length - index}</div><div class="historico-time"><i class="fa-solid fa-clock"></i> ${horaExibida}</div></div>`;
        grid.appendChild(card);
    });
}

async function carregarDados() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/events/status`);
        if (!res.ok) throw new Error("Erro na requisição");
        const data = await res.json();
        
        document.getElementById("status").innerText = data.mensagem || "AGUARDANDO";
        const resultElement = document.getElementById("result");
        if (resultElement) {
            resultElement.innerText = `${data.numero} - ${data.cor.toUpperCase()}`;
            resultElement.style.color = data.cor === "red" ? "#ff416c" : data.cor === "black" ? "#707070" : "#fff";
        }
        const dataElement = document.getElementById("data");
        if (dataElement) dataElement.innerText = JSON.stringify(data, null, 2);
        
        // NOVA LÓGICA: Verificar se é primeira execução ou se é ID realmente novo
        if (primeiraExecucao) {
            // Na primeira execução após F5, só atualiza o ID de referência, não adiciona
            if (data.id) {
                console.log(`🔄 Primeira execução - Sincronizando com ID da API: ${data.id}`);
                if (data.id > ultimoIdProcessado) {
                    ultimoIdProcessado = data.id;
                    localStorage.setItem('blazeHunters_ultimoId', ultimoIdProcessado.toString());
                }
            }
            primeiraExecucao = false;
        } else {
            // A partir da segunda execução, verifica se é ID novo para adicionar
            if (data.id && data.id > ultimoIdProcessado) {
                console.log(`🆕 Novo resultado! ID: ${data.id} | Anterior: ${ultimoIdProcessado}`);
                
                ultimoIdProcessado = data.id;
                const novaEntrada = { 
                    numero: data.numero, 
                    cor: data.cor, 
                    hora: data.hora || "??:??", 
                    mensagem: data.mensagem || null, 
                    timestamp_recebimento: data.id 
                };
                historicoLocal.unshift(novaEntrada);
                historicoLocal = historicoLocal.slice(0, 120);
                salvarHistoricoLocal();
                renderizarUltimos3();
                renderizarResultados();
                mostrarNotificacaoNovoResultado(data);
            }
        }
        
        const precisaoElement = document.getElementById("accuracy");
        if (precisaoElement && data.placar) {
            const wins = data.placar.wins || 0;
            const losses = data.placar.losses || 0;
            const horaRegistro = data.placar.hora_registro;
            const horaAtual = new Date().getHours();
            const textoHorario = `Placar Horário ${horaAtual}h`;
            const corPlacar = wins > losses ? "#00b09b" : wins < losses ? "#ff416c" : "#f5af19";
            precisaoElement.innerHTML = `<div style="font-size: 0.9rem; color: #aaa; margin-bottom: 5px;">${textoHorario}</div><div style="font-size: 1.1rem; font-weight: bold; color: ${corPlacar}">WIN ${wins} <span style="color: #666">|</span> LOSS ${losses}</div>`;
        }
        
        if (data.mensagem && !primeiraExecucao) {
            const msgUpper = data.mensagem.toUpperCase();
            const ehEntrada = msgUpper.includes("ENTRAR") || msgUpper.includes("SINAL") || msgUpper.includes("ENTRADA");
            if (ehEntrada && filtroHorariosAtivo) {
                const horarioPermitido = verificarHorarioPermitido();
                if (horarioPermitido) {
                    exibirAlerta("✓ ENTRADA CONFIRMADA - Todos os filtros alinhados!");
                    exibirAlerta(data.mensagem);
                } else {
                    const horaAtual = obterHoraLocal();
                    console.log(`[FILTRO HORÁRIO] Sinal bloqueado - Horário ${horaAtual} não está na lista permitida`);
                    exibirAlerta(`⚠ Sinal bloqueado - Horário ${horaAtual} não autorizado`);
                }
            } else {
                exibirAlerta(data.mensagem);
            }
        }
        
        atualizarStatusConexao(true);
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        const statusElement = document.getElementById("status");
        if (statusElement) {
            statusElement.innerText = "ERRO DE CONEXÃO";
            statusElement.style.color = "#ff4444";
        }
        atualizarStatusConexao(false);
        primeiraExecucao = false; // Reset da flag mesmo em erro
    }
}

function exibirAlerta(msg) {
    const alertasAntigos = document.querySelectorAll(".alerta-flutuante");
    for (let alerta of alertasAntigos) {
        if (alerta.innerText === msg) return;
    }
    const div = document.createElement("div");
    div.className = "alerta-flutuante";
    div.innerText = msg;
    if (msg.toUpperCase().includes("WIN") || msg.toUpperCase().includes("GREEN") || msg.toUpperCase().includes("CONFIRMADA")) {
        div.style.background = "linear-gradient(45deg, #00b09b, #96c93d)";
    } else if (msg.toUpperCase().includes("LOSS")) {
        div.style.background = "linear-gradient(45deg, #ff416c, #ff4b2b)";
    } else if (msg.toUpperCase().includes("SINAL") || msg.toUpperCase().includes("ENTRAR")) {
        div.style.background = "linear-gradient(45deg, #f857a6, #ff5858)";
    } else if (msg.toUpperCase().includes("BLOQUEADO")) {
        div.style.background = "linear-gradient(45deg, #ff6b00, #ff8c00)";
    } else {
        div.style.background = "#333";
    }
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = "slideUp 0.5s ease forwards";
        setTimeout(() => div.remove(), 500);
    }, 5000);
}

function atualizarStatusConexao(online) {
    const connectionStatus = document.getElementById("connectionStatus");
    if (!connectionStatus) return;
    if (online) {
        connectionStatus.classList.remove("offline");
        connectionStatus.classList.add("online");
        connectionStatus.querySelector(".status-text").innerText = "ONLINE";
    } else {
        connectionStatus.classList.remove("online");
        connectionStatus.classList.add("offline");
        connectionStatus.querySelector(".status-text").innerText = "OFFLINE";
    }
}

function mostrarNotificacaoNovoResultado(data) {
    const resultCard = document.querySelector(".card-result");
    if (resultCard) {
        resultCard.style.animation = "none";
        setTimeout(() => { resultCard.style.animation = "pulseCard 0.5s ease"; }, 10);
    }
}

const style = document.createElement("style");
style.textContent = `
    .ball-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 5px; }
    .ball-time { font-size: 10px; color: #888; margin-top: 4px; font-weight: 500; font-family: monospace; }
    .ball-wrapper-large { display: flex; flex-direction: column; align-items: center; margin: 0 10px; }
    .ball-time-large { font-size: 14px; color: #ddd; margin-top: 8px; font-weight: bold; font-family: monospace; }
    @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
    @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3) rotate(-10deg); } 50% { transform: scale(1.1) rotate(5deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
    @keyframes pulseCard { 0%, 100% { transform: scale(1); box-shadow: var(--shadow-md); } 50% { transform: scale(1.02); box-shadow: var(--shadow-lg), var(--shadow-red); } }
    @keyframes slideDown { from { top: -100px; opacity: 0; } to { top: 20px; opacity: 1; } }
    @keyframes slideUp { from { top: 20px; opacity: 1; } to { top: -100px; opacity: 0; } }
    .status.offline { background: linear-gradient(135deg, #aa0000 0%, #ff0000 100%); color: #fff; box-shadow: 0 4px 16px rgba(255, 0, 0, 0.3); }
    .alerta-flutuante { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 15px 40px; color: white; font-weight: bold; text-transform: uppercase; border-radius: 50px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9999; font-size: 1.2rem; animation: slideDown 0.5s ease forwards; text-align: center; border: 2px solid rgba(255, 255, 255, 0.2); backdrop-filter: blur(5px); }
    .horario-performance-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .horario-performance-card.sem-loss { background: linear-gradient(135deg, #00b09b 0%, #96c93d 100%); }
    .performance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .performance-time { display: flex; align-items: center; gap: 8px; font-size: 1.3rem; font-weight: bold; }
    .performance-badge { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; }
    .performance-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 15px 0; }
    .stat { text-align: center; }
    .stat-label { display: block; font-size: 0.75rem; opacity: 0.8; margin-bottom: 4px; }
    .stat-value { display: block; font-size: 1.4rem; font-weight: bold; }
    .performance-bar { height: 8px; background: rgba(0,0,0,0.2); border-radius: 10px; overflow: hidden; margin: 10px 0; }
    .bar-fill { height: 100%; transition: width 0.3s ease; }
    .performance-rate { text-align: center; font-size: 0.9rem; opacity: 0.9; }
    .ranking-card { background: #2a2a2a; border-radius: 10px; padding: 15px; display: grid; grid-template-columns: 50px 1fr auto auto; gap: 15px; align-items: center; margin-bottom: 10px; }
    .ranking-posicao { font-size: 1.5rem; font-weight: bold; text-align: center; }
    .ranking-horario { font-size: 1.1rem; font-weight: bold; }
    .ranking-stats { display: flex; gap: 10px; font-size: 0.9rem; }
    .ranking-taxa, .ranking-loss-rate { text-align: center; }
    .taxa-label, .loss-label { font-size: 0.7rem; color: #888; }
    .taxa-value, .loss-value { font-size: 1.2rem; font-weight: bold; }
    .posicao-numero { display: inline-block; width: 30px; height: 30px; line-height: 30px; background: #444; border-radius: 50%; }
    .cell-win { color: #00b09b; font-weight: bold; }
    .cell-loss { color: #ff416c; font-weight: bold; }
    .performance-badge.performance-perfeita { background: linear-gradient(135deg, #00b09b, #96c93d); color: white; padding: 4px 10px; border-radius: 12px; font-weight: bold; }
    .performance-badge.performance-excelente { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 10px; border-radius: 12px; }
    .performance-badge.performance-boa { background: linear-gradient(135deg, #f5af19, #f12711); color: white; padding: 4px 10px; border-radius: 12px; }
    .performance-badge.performance-media { background: #666; color: white; padding: 4px 10px; border-radius: 12px; }
    .performance-badge.performance-ruim { background: #ff416c; color: white; padding: 4px 10px; border-radius: 12px; }
    .horarios-performance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin: 20px 0; }
    .horarios-ranking-grid { display: flex; flex-direction: column; gap: 10px; margin: 20px 0; }
    .analise-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; padding: 20px; background: #2a2a2a; border-radius: 10px; }
    .filter-group { display: flex; flex-direction: column; gap: 8px; }
    .filter-group label { font-size: 0.9rem; color: #aaa; font-weight: 500; }
    .filter-group select, .filter-group input { padding: 10px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px; color: white; }
    .time-range-inputs { display: flex; align-items: center; gap: 8px; }
    .time-range-inputs input { flex: 1; }
    .analise-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .resumo-card { background: #2a2a2a; border-radius: 12px; padding: 20px; display: flex; gap: 15px; align-items: center; }
    .resumo-icon { width: 50px; height: 50px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white; }
    .resumo-info { display: flex; flex-direction: column; gap: 5px; }
    .resumo-label { font-size: 0.85rem; color: #aaa; }
    .resumo-value { font-size: 1.8rem; font-weight: bold; }
    .analise-section { margin: 30px 0; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #444; }
    .section-badge { background: #444; padding: 5px 15px; border-radius: 20px; font-size: 0.85rem; }
    .table-container { overflow-x: auto; margin: 20px 0; }
    .stats-table { width: 100%; border-collapse: collapse; background: #2a2a2a; border-radius: 10px; overflow: hidden; }
    .stats-table thead { background: #1a1a1a; }
    .stats-table th { padding: 15px; text-align: left; font-weight: 600; color: #aaa; }
    .stats-table td { padding: 12px 15px; border-top: 1px solid #333; }
    .stats-table tbody tr:hover { background: #333; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .btn-small { padding: 8px 16px; font-size: 0.85rem; }
    .empty-state { text-align: center; padding: 40px; color: #888; }
    .empty-state i { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }
`;
document.head.appendChild(style);

carregarDados();
setInterval(carregarDados, CONFIG.REFRESH_INTERVAL);
setInterval(() => {
    if (document.querySelector('#horarios.active')) renderizarListaHorarios();
}, 60000);

console.log("🔥 Blaze Hunters v2.0.0: Sistema de Análise Avançada Ativado");
console.log(`📍 Filtro de Horários: ${filtroHorariosAtivo ? 'ATIVO' : 'INATIVO'}`);
console.log(`⏰ Horários Permitidos: ${horariosPermitidos.length}`);
console.log(`💾 Histórico Local: ${historicoLocal.length} resultados salvos`);
console.log(`🆔 Último ID Processado: ${ultimoIdProcessado}`);
console.log(`📊 Sistema de Persistência SQLite + LocalStorage`);