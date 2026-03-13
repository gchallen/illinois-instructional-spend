import { writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve } from "path"
import type { DepartmentAnalysis, Scenario } from "./analysis"

const OUTPUT_DIR = resolve(import.meta.dir, "../output")

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

export function generateReport(results: DepartmentAnalysis[]) {
  ensureOutputDir()

  writeFileSync(resolve(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2))

  const sorted = [...results].filter((r) => r.uniqueStudents > 0).sort((a, b) => b.perStudent.realistic - a.perStudent.realistic)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UIUC Instructional Salary Spend — Spring 2026</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; }
    h1 { text-align: center; margin-bottom: 8px; font-size: 1.5rem; }
    .subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 0.9rem; }

    .controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; padding: 12px 16px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .controls label { font-size: 0.85rem; font-weight: 600; color: #555; }
    .controls input, .controls select { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; }
    .controls input[type="text"] { width: 200px; }
    .controls select { min-width: 140px; }
    .metric-toggle { display: flex; gap: 4px; }
    .metric-toggle button { padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
    .metric-toggle button.active { background: #2563eb; color: white; border-color: #2563eb; }
    .stat-pills { display: flex; gap: 8px; margin-left: auto; font-size: 0.8rem; color: #666; }
    .stat-pills span { background: #e5e7eb; padding: 3px 10px; border-radius: 12px; }

    .chart-container { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto; }
    .chart-inner { min-width: 800px; height: 500px; }

    .table-wrap { overflow-x: auto; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.8rem; }
    th { background: #2563eb; color: white; padding: 8px 6px; text-align: left; white-space: nowrap; cursor: pointer; user-select: none; position: sticky; top: 0; }
    th:hover { background: #1d4ed8; }
    th .sort-arrow { opacity: 0.5; font-size: 0.7rem; margin-left: 3px; }
    th.sorted .sort-arrow { opacity: 1; }
    td { padding: 6px; border-bottom: 1px solid #eee; white-space: nowrap; }
    tr:hover td { background: #f0f4ff; }
    tr.expanded td { background: #e8eeff; }
    .right { text-align: right; }
    .detail-row td { padding: 0; background: #fafbff; }
    .detail-content { padding: 12px 20px; font-size: 0.8rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
    .detail-section h4 { font-size: 0.85rem; color: #2563eb; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .detail-section dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; }
    .detail-section dt { color: #666; }
    .detail-section dd { font-weight: 600; text-align: right; }

    .note { margin-top: 16px; font-size: 0.8rem; color: #888; text-align: center; line-height: 1.5; }

    .highlight { background: #fef08a; }
  </style>
</head>
<body>
  <h1>UIUC Instructional Salary Spend Per Student</h1>
  <div class="subtitle">Spring 2026 — Grey Book Salaries × CIS Course Data × LDAP Enrollment</div>

  <div class="controls">
    <label for="search">Search:</label>
    <input type="text" id="search" placeholder="e.g. CS, Computer, Engineering...">

    <label for="minStudents">Min students:</label>
    <input type="number" id="minStudents" value="0" min="0" style="width:80px">

    <label>Metric:</label>
    <div class="metric-toggle">
      <button class="active" data-metric="perStudent">$/Student</button>
      <button data-metric="perCreditHour">$/Credit Hr</button>
      <button data-metric="instructionalSpend">Total Spend</button>
    </div>

    <div class="stat-pills">
      <span id="deptCount"></span>
      <span id="studentCount"></span>
    </div>
  </div>

  <div class="chart-container">
    <div class="chart-inner">
      <canvas id="spendChart"></canvas>
    </div>
  </div>

  <div class="table-wrap">
  <table id="dataTable">
    <thead>
      <tr>
        <th data-key="cisSubject" data-type="string">Subject <span class="sort-arrow">▾</span></th>
        <th data-key="cisName" data-type="string">Name <span class="sort-arrow">▾</span></th>
        <th data-key="totalFaculty" data-type="number" class="right">Faculty <span class="sort-arrow">▾</span></th>
        <th data-key="matchedFaculty" data-type="number" class="right">Matched <span class="sort-arrow">▾</span></th>
        <th data-key="matchRate" data-type="number" class="right">Match% <span class="sort-arrow">▾</span></th>
        <th data-key="uniqueStudents" data-type="number" class="right">Students <span class="sort-arrow">▾</span></th>
        <th data-key="courseCount" data-type="number" class="right">Courses <span class="sort-arrow">▾</span></th>
        <th data-key="matchedProposedSalary" data-type="number" class="right">Matched Salary <span class="sort-arrow">▾</span></th>
        <th data-key="spend_realistic" data-type="number" class="right sorted">Spend/Stud (R) <span class="sort-arrow">▾</span></th>
        <th data-key="spend_generous" data-type="number" class="right">Spend/Stud (G) <span class="sort-arrow">▾</span></th>
        <th data-key="spend_unlikely" data-type="number" class="right">Spend/Stud (U) <span class="sort-arrow">▾</span></th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>

  <div class="note">
    <strong>Scenarios:</strong> Realistic (tenure-track 20%) · Generous (tenure-track 30%) · Unlikely (tenure-track 40%) — Teaching faculty always 70%, Clinical 50%<br>
    Only Grey Book faculty matched to CIS instructors are counted. Unmatched CIS instructors (TAs, adjuncts) excluded.<br>
    Click any row to expand details. Click column headers to sort.<br>
    Generated ${new Date().toISOString().slice(0, 10)}.
  </div>

  <script>
    const DATA = ${JSON.stringify(sorted)};

    let currentMetric = 'perStudent';
    let sortKey = 'spend_realistic';
    let sortDir = -1; // descending
    let searchTerm = '';
    let minStudents = 0;
    let expandedSubject = null;
    let chart = null;

    function getMetricValue(r, scenario) {
      return r[currentMetric]?.[scenario] ?? 0;
    }

    function getSortValue(r, key) {
      if (key === 'spend_realistic') return getMetricValue(r, 'realistic');
      if (key === 'spend_generous') return getMetricValue(r, 'generous');
      if (key === 'spend_unlikely') return getMetricValue(r, 'unlikely');
      return r[key] ?? '';
    }

    function fmt$(n) { return '$' + Math.round(n).toLocaleString(); }
    function fmtPct(n) { return (n * 100).toFixed(0) + '%'; }

    function metricLabel() {
      if (currentMetric === 'perStudent') return 'Spend Per Student ($)';
      if (currentMetric === 'perCreditHour') return 'Spend Per Credit Hour ($)';
      return 'Total Instructional Spend ($)';
    }

    function filteredData() {
      let d = DATA.filter(r => r.uniqueStudents >= minStudents);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        d = d.filter(r =>
          r.cisSubject.toLowerCase().includes(q) ||
          r.cisName.toLowerCase().includes(q) ||
          r.grayBookName.toLowerCase().includes(q)
        );
      }
      const type = sortKey.startsWith('spend_') ? 'number' : (document.querySelector('th[data-key="' + sortKey + '"]')?.dataset.type || 'number');
      d.sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        if (type === 'string') return sortDir * String(va).localeCompare(String(vb));
        return sortDir * ((va || 0) - (vb || 0));
      });
      return d;
    }

    function renderChart() {
      const d = filteredData();
      const labels = d.map(r => r.cisSubject);
      const realistic = d.map(r => Math.round(getMetricValue(r, 'realistic')));
      const generous = d.map(r => Math.round(getMetricValue(r, 'generous')));
      const unlikely = d.map(r => Math.round(getMetricValue(r, 'unlikely')));

      const container = document.querySelector('.chart-inner');
      container.style.minWidth = Math.max(800, d.length * 50) + 'px';

      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('spendChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Realistic (TT 20%)', data: realistic, backgroundColor: 'rgba(37, 99, 235, 0.8)' },
            { label: 'Generous (TT 30%)', data: generous, backgroundColor: 'rgba(245, 158, 11, 0.8)' },
            { label: 'Unlikely (TT 40%)', data: unlikely, backgroundColor: 'rgba(239, 68, 68, 0.7)' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: metricLabel(), font: { size: 16 } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString() } },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() }, title: { display: true, text: metricLabel() } },
            x: { ticks: { maxRotation: 90, minRotation: 45 } },
          },
        },
      });
    }

    function renderTable() {
      const d = filteredData();
      const tbody = document.querySelector('#dataTable tbody');
      tbody.innerHTML = '';

      document.getElementById('deptCount').textContent = d.length + ' depts';
      document.getElementById('studentCount').textContent = d.reduce((s, r) => s + r.uniqueStudents, 0).toLocaleString() + ' students';

      // Update header labels based on metric
      const prefix = currentMetric === 'perStudent' ? 'Spend/Stud' : currentMetric === 'perCreditHour' ? 'Spend/CrHr' : 'Total Spend';
      document.querySelector('th[data-key="spend_realistic"]').firstChild.textContent = prefix + ' (R) ';
      document.querySelector('th[data-key="spend_generous"]').firstChild.textContent = prefix + ' (G) ';
      document.querySelector('th[data-key="spend_unlikely"]').firstChild.textContent = prefix + ' (U) ';

      // Update sort indicators
      document.querySelectorAll('#dataTable th').forEach(th => {
        th.classList.toggle('sorted', th.dataset.key === sortKey);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow && th.dataset.key === sortKey) {
          arrow.textContent = sortDir === 1 ? '▴' : '▾';
        }
      });

      for (const r of d) {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.subject = r.cisSubject;
        if (r.cisSubject === expandedSubject) tr.classList.add('expanded');
        tr.innerHTML = \`
          <td><strong>\${r.cisSubject}</strong></td>
          <td>\${r.cisName}</td>
          <td class="right">\${r.totalFaculty}</td>
          <td class="right">\${r.matchedFaculty}</td>
          <td class="right">\${fmtPct(r.matchRate)}</td>
          <td class="right">\${r.uniqueStudents.toLocaleString()}</td>
          <td class="right">\${r.courseCount}</td>
          <td class="right">\${fmt$(r.matchedProposedSalary)}</td>
          <td class="right">\${fmt$(getMetricValue(r, 'realistic'))}</td>
          <td class="right">\${fmt$(getMetricValue(r, 'generous'))}</td>
          <td class="right">\${fmt$(getMetricValue(r, 'unlikely'))}</td>
        \`;
        tr.addEventListener('click', () => toggleDetail(r.cisSubject));
        tbody.appendChild(tr);

        if (r.cisSubject === expandedSubject) {
          const detailTr = document.createElement('tr');
          detailTr.classList.add('detail-row');
          detailTr.innerHTML = \`<td colspan="11">\${renderDetail(r)}</td>\`;
          tbody.appendChild(detailTr);
        }
      }
    }

    function renderDetail(r) {
      return \`<div class="detail-content">
        <div class="detail-section">
          <h4>Faculty Breakdown</h4>
          <dl>
            <dt>Teaching (lecturers)</dt><dd>\${r.teachingCount}</dd>
            <dt>Tenure-track (professors)</dt><dd>\${r.tenureTrackCount}</dd>
            <dt>Research</dt><dd>\${r.researchCount}</dd>
            <dt>Clinical</dt><dd>\${r.clinicalCount}</dd>
            <dt>Other</dt><dd>\${r.otherCount}</dd>
            <dt>Total in Grey Book</dt><dd>\${r.totalFaculty}</dd>
            <dt>Matched to CIS</dt><dd>\${r.matchedFaculty} (\${fmtPct(r.matchRate)})</dd>
            <dt>Unmatched CIS instructors</dt><dd>\${r.unmatchedInstructors}</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Salary</h4>
          <dl>
            <dt>Total Grey Book salary</dt><dd>\${fmt$(r.totalProposedSalary)}</dd>
            <dt>Matched salary</dt><dd>\${fmt$(r.matchedProposedSalary)}</dd>
            <dt>Instructional spend (R)</dt><dd>\${fmt$(r.instructionalSpend.realistic)}</dd>
            <dt>Instructional spend (G)</dt><dd>\${fmt$(r.instructionalSpend.generous)}</dd>
            <dt>Instructional spend (U)</dt><dd>\${fmt$(r.instructionalSpend.unlikely)}</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Per Student</h4>
          <dl>
            <dt>Unique students</dt><dd>\${r.uniqueStudents.toLocaleString()}</dd>
            <dt>Courses</dt><dd>\${r.courseCount}</dd>
            <dt>Credit hours (total)</dt><dd>\${r.totalCreditHours.toLocaleString()}</dd>
            <dt>$/student (R)</dt><dd>\${fmt$(r.perStudent.realistic)}</dd>
            <dt>$/student (G)</dt><dd>\${fmt$(r.perStudent.generous)}</dd>
            <dt>$/student (U)</dt><dd>\${fmt$(r.perStudent.unlikely)}</dd>
            <dt>$/credit hr (R)</dt><dd>\${fmt$(r.perCreditHour.realistic)}</dd>
            <dt>$/credit hr (G)</dt><dd>\${fmt$(r.perCreditHour.generous)}</dd>
            <dt>$/credit hr (U)</dt><dd>\${fmt$(r.perCreditHour.unlikely)}</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Mapping</h4>
          <dl>
            <dt>CIS Subject</dt><dd>\${r.cisSubject}</dd>
            <dt>Grey Book Dept</dt><dd>\${r.grayBookName}</dd>
            <dt>Grey Book ID</dt><dd>\${r.grayBookId}</dd>
          </dl>
        </div>
      </div>\`;
    }

    function toggleDetail(subject) {
      expandedSubject = expandedSubject === subject ? null : subject;
      renderTable();
    }

    function render() {
      renderChart();
      renderTable();
    }

    // Search
    document.getElementById('search').addEventListener('input', e => {
      searchTerm = e.target.value;
      render();
    });

    // Min students
    document.getElementById('minStudents').addEventListener('input', e => {
      minStudents = parseInt(e.target.value) || 0;
      render();
    });

    // Metric toggle
    document.querySelectorAll('.metric-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metric-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMetric = btn.dataset.metric;
        // Reset sort to realistic of current metric
        sortKey = 'spend_realistic';
        sortDir = -1;
        render();
      });
    });

    // Column sorting
    document.querySelectorAll('#dataTable th').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) return;
        if (sortKey === key) {
          sortDir *= -1;
        } else {
          sortKey = key;
          sortDir = th.dataset.type === 'string' ? 1 : -1;
        }
        renderTable();
      });
    });

    render();
  </script>
</body>
</html>`;

  writeFileSync(resolve(OUTPUT_DIR, "report.html"), html)
  console.log(`\n  Report written to output/report.html`)
  console.log(`  Results written to output/results.json`)
}
