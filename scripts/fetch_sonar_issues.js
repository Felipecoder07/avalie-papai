const fs = require('fs');
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

async function fetchAll() {
  const projectKey = 'Felipecoder07_Arenix';
  let page = 1;
  const pageSize = 100;
  let allIssues = [];
  let total = 0;

  console.log('Fetching issues from SonarCloud for project:', projectKey);
  while (true) {
    const url = 'https://sonarcloud.io/api/issues/search?componentKeys=' + projectKey + '&p=' + page + '&ps=' + pageSize;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Failed page ' + page + ': ' + res.status + ' ' + res.statusText);
        break;
      }
      const data = await res.json();
      const numTotal = Number.parseInt(String(data?.total || 0), 10);
      const batchCount = Array.isArray(data?.issues) ? data.issues.length : 0;
      total = numTotal;
      if (Array.isArray(data?.issues)) {
        allIssues.push(...data.issues);
      }
      const accumulated = allIssues.length;
      const safeTotalCount = Number.isFinite(total) ? Math.floor(Math.abs(total)) : 0;
      console.log(`Page ${page}: fetched ${batchCount} issues (accumulated ${accumulated} of ${safeTotalCount})`);
      if (allIssues.length >= total || data.issues.length === 0) {
        break;
      }
      page++;
    } catch (err) {
      console.error('Error on page ' + page + ':', err.message);
      break;
    }
  }

  // Also fetch hotspots if any
  let allHotspots = [];
  try {
    let hPage = 1;
    while (true) {
      const hUrl = 'https://sonarcloud.io/api/hotspots/search?projectKey=' + projectKey + '&p=' + hPage + '&ps=100';
      const hRes = await fetch(hUrl);
      if (!hRes.ok) break;
      const hData = await hRes.json();
      allHotspots.push(...(hData.hotspots || []));
      if (allHotspots.length >= (hData.paging?.total || 0) || !hData.hotspots?.length) break;
      hPage++;
    }
    console.log('Fetched ' + allHotspots.length + ' security hotspots');
  } catch (e) {
    console.log('Hotspots error:', e.message);
  }

  // Also fetch project measures (overview metrics)
  let measures = {};
  try {
    const mUrl = 'https://sonarcloud.io/api/measures/component?component=' + projectKey + '&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,security_hotspots,sqale_index,reliability_rating,security_rating,sqale_rating';
    const mRes = await fetch(mUrl);
    if (mRes.ok) {
      measures = await mRes.json();
      console.log('Fetched project metrics');
    }
  } catch (e) {
    console.log('Measures error:', e.message);
  }

  fs.writeFileSync('sonar_issues_raw.json', JSON.stringify({
    total: allIssues.length,
    measures: measures.component?.measures || [],
    issues: allIssues,
    hotspots: allHotspots
  }, null, 2));
  console.log('Saved sonar_issues_raw.json successfully with ' + allIssues.length + ' issues!');
}

fetchAll();
