/**
 * Utilitário unificado de data e hora com suporte a fuso horário local (padrão America/Sao_Paulo).
 * Garante precisão de fuso horário em qualquer servidor local ou nuvem (AWS, Docker, Vercel, Railway).
 */

const getTodayString = (timeZone = process.env.APP_TIMEZONE || 'America/Sao_Paulo') => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // Retorna "YYYY-MM-DD"
};

const getLocalTimeString = (timeZone = process.env.APP_TIMEZONE || 'America/Sao_Paulo') => {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(new Date()); // Retorna "HH:MM"
};

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Formata a competência amigável da fatura a partir da data de vencimento.
 * Ex: '2026-10-10' -> 'Outubro/2026'
 */
function formatarCompetencia(dataVencimentoStr, ciclo = 'mensal') {
  if (!dataVencimentoStr) return 'Mensalidade';
  const [anoStr, mesStr] = dataVencimentoStr.split('-');
  const ano = Number.parseInt(anoStr, 10);
  const mesIdx = Number.parseInt(mesStr, 10) - 1;
  const mesNome = NOMES_MESES[mesIdx] || mesStr;

  if (ciclo === 'anual') {
    return `${mesNome}/${ano} a ${mesNome}/${ano + 1}`;
  }
  return `${mesNome}/${ano}`;
}

/**
 * Calcula a próxima data de vencimento avançando exatamente 1 ciclo (+1 mês ou +1 ano),
 * preservando o dia de aniversário da assinatura com ajuste para o tamanho do mês.
 */
function calcularProximaDataVencimento(dataBaseStr, diaVencimento = 10, ciclo = 'mensal') {
  const diaAlvo = Math.min(Math.max(Number.parseInt(diaVencimento, 10) || 10, 1), 31);

  if (dataBaseStr) {
    const [anoStr, mesStr] = dataBaseStr.split('-');
    let ano = Number.parseInt(anoStr, 10);
    let mes = Number.parseInt(mesStr, 10); // 1 a 12

    if (ciclo === 'anual') {
      ano += 1;
    } else {
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const diaFinal = Math.min(diaAlvo, diasNoMes);
    const mesFormatado = String(mes).padStart(2, '0');
    const diaFormatado = String(diaFinal).padStart(2, '0');
    return `${ano}-${mesFormatado}-${diaFormatado}`;
  }

  // Se não há data base anterior:
  const hoje = new Date();
  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();

  let ano = anoHoje;
  let mes = mesHoje;

  // Se hoje já passou do dia do vencimento, o próximo vencimento é no mês seguinte
  if (diaHoje > diaAlvo) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diaFinal = Math.min(diaAlvo, diasNoMes);
  const mesFormatado = String(mes).padStart(2, '0');
  const diaFormatado = String(diaFinal).padStart(2, '0');
  return `${ano}-${mesFormatado}-${diaFormatado}`;
}

/**
 * Retorna a quantidade de dias restantes no período de trial gratuito.
 */
function calcularDiasRestantesTrial(trialExpiraEm) {
  if (!trialExpiraEm) return 0;
  const hojeStr = new Date().toISOString().split('T')[0];
  if (trialExpiraEm < hojeStr) return 0;
  const dHoje = new Date(hojeStr + 'T00:00:00Z');
  const dTrial = new Date(trialExpiraEm + 'T00:00:00Z');
  const diffMs = dTrial.getTime() - dHoje.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

module.exports = {
  getTodayString,
  getLocalTimeString,
  NOMES_MESES,
  formatarCompetencia,
  calcularProximaDataVencimento,
  calcularDiasRestantesTrial
};
