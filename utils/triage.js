// utils/triage.js
function triageRule(data){
  const temp = parseFloat(data.temperature || 0);
  const pain = parseInt(data.pain_level || 0);
  const bleeding = (data.bleeding || '').toLowerCase() === 'yes' || (data.bleeding || '').toLowerCase() === 'có';
  if (temp >= 38 || bleeding || pain >= 8) return 'red';
  if (pain >=5 || temp >= 37.5) return 'yellow';
  return 'green';
}

function summaryText(data){
  return `Name: ${data.name || ''}; Phone: ${data.phone || ''}; Temp:${data.temperature || ''}; Pain:${data.pain_level || ''}; Bleeding:${data.bleeding || ''}; Symptoms:${data.symptoms || ''}`;
}

module.exports = { triageRule, summaryText };
