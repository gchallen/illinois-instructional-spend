import { writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve } from "path"
import type { DepartmentAnalysis, DataQualityFlags } from "./analysis"

const OUTPUT_DIR = resolve(import.meta.dir, "../output")

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><polygon points="16,4 30,11 16,18 2,11" fill="#13294B"/><polygon points="16,18 30,11 30,13 16,20 2,13 2,11" fill="#0d1d35"/><line x1="24" y1="11" x2="24" y2="19" stroke="#E84A27" stroke-width="1.5" stroke-linecap="round"/><circle cx="24" cy="20" r="1.5" fill="#E84A27"/><text x="16" y="29" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="13" fill="#E84A27">$</text></svg>`

function faviconDataUri() {
  return "data:image/svg+xml," + encodeURIComponent(FAVICON_SVG)
}

export function generateReport(results: DepartmentAnalysis[]) {
  ensureOutputDir()

  writeFileSync(resolve(OUTPUT_DIR, "favicon.svg"), FAVICON_SVG)
  writeFileSync(resolve(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2))

  const included = results.filter((r) => !r.dataQuality.excluded)
  const excluded = results.filter((r) => r.dataQuality.excluded)
  const sorted = [...included].filter((r) => r.uniqueStudents > 0).sort((a, b) => b.perStudent - a.perStudent)

  // Aggregate stats
  const totalTeachingSalary = sorted.reduce((s, r) => s + r.matchedTeachingFocusedSalary, 0)
  const totalResearchSalary = sorted.reduce((s, r) => s + r.matchedResearchFocusedSalary, 0)
  const totalStudents = sorted.reduce((s, r) => s + r.uniqueStudents, 0)
  const totalMatchedSalary = sorted.reduce((s, r) => s + r.matchedProposedSalary, 0)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="${faviconDataUri()}">
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
    .metric-toggle { display: flex; gap: 4px; }
    .metric-toggle button { padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
    .metric-toggle button.active { background: #2563eb; color: white; border-color: #2563eb; }
    .stat-pills { display: flex; gap: 8px; margin-left: auto; font-size: 0.8rem; color: #666; }
    .stat-pills span { background: #e5e7eb; padding: 3px 10px; border-radius: 12px; }

    .slider-group { display: flex; align-items: center; gap: 6px; }
    .slider-group input[type="range"] { width: 100px; }
    .slider-group .slider-val { font-size: 0.85rem; font-weight: 600; min-width: 32px; text-align: right; }

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
    .warning-badge { display: inline-block; font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; margin-left: 4px; font-weight: 600; vertical-align: middle; }
    .warning-badge.match-rate { background: #fef3c7; color: #92400e; }
    .warning-badge.low-conf { background: #fee2e2; color: #991b1b; }
    .warning-badge.ldap { background: #ede9fe; color: #5b21b6; }
    .warning-badge.collision { background: #e0e7ff; color: #3730a3; }
    .excluded-section { margin-top: 24px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .excluded-section h2 { font-size: 1.1rem; color: #666; margin-bottom: 12px; }
    .excluded-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .excluded-table th { background: #9ca3af; color: white; padding: 6px 8px; text-align: left; }
    .excluded-table td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    .methodology { margin-top: 24px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.8rem; color: #555; line-height: 1.6; }
    .methodology h2 { font-size: 1.1rem; color: #333; margin-bottom: 12px; }
    .methodology ul { margin: 8px 0 8px 20px; }
    .methodology li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>UIUC Instructional Salary Spend Per Student</h1>
  <div class="subtitle">Spring 2026 — Grey Book Salaries × CIS Course Data × LDAP Enrollment</div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:16px">
    <div style="background:white;border-radius:8px;padding:12px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;min-width:180px">
      <div style="font-size:0.75rem;color:#666;text-transform:uppercase;letter-spacing:0.5px">Teaching-Focused Salary</div>
      <div style="font-size:1.3rem;font-weight:700;color:#2563eb">$${Math.round(totalTeachingSalary).toLocaleString()}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;min-width:180px">
      <div style="font-size:0.75rem;color:#666;text-transform:uppercase;letter-spacing:0.5px">Research-Focused Salary</div>
      <div style="font-size:1.3rem;font-weight:700;color:#7c3aed">$${Math.round(totalResearchSalary).toLocaleString()}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;min-width:180px">
      <div style="font-size:0.75rem;color:#666;text-transform:uppercase;letter-spacing:0.5px">Total Matched Salary</div>
      <div style="font-size:1.3rem;font-weight:700;color:#333">$${Math.round(totalMatchedSalary).toLocaleString()}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;min-width:180px">
      <div style="font-size:0.75rem;color:#666;text-transform:uppercase;letter-spacing:0.5px">Total Students</div>
      <div style="font-size:1.3rem;font-weight:700;color:#333">${totalStudents.toLocaleString()}</div>
    </div>
  </div>

  <div class="controls">
    <label for="search">Search:</label>
    <input type="text" id="search" placeholder="e.g. CS, Computer, Engineering...">

    <label for="minStudents">Min students:</label>
    <input type="number" id="minStudents" value="0" min="0" style="width:80px">

    <label for="minFaculty">Min faculty:</label>
    <input type="number" id="minFaculty" value="0" min="0" style="width:80px">

    <label for="minCourses">Min courses:</label>
    <input type="number" id="minCourses" value="0" min="0" style="width:80px">

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

  <div class="controls">
    <label>Teaching-focused:</label>
    <div class="slider-group">
      <input type="range" id="teachingPct" min="0" max="100" value="70">
      <span class="slider-val" id="teachingPctVal">70%</span>
    </div>

    <label>Research-focused:</label>
    <div class="slider-group">
      <input type="range" id="researchPct" min="0" max="100" value="30">
      <span class="slider-val" id="researchPctVal">30%</span>
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
        <th data-key="matchedFaculty" data-type="number" class="right">Matched <span class="sort-arrow">▾</span></th>
        <th data-key="matchRate" data-type="number" class="right">% Teaching <span class="sort-arrow">▾</span></th>
        <th data-key="uniqueStudents" data-type="number" class="right">Students <span class="sort-arrow">▾</span></th>
        <th data-key="courseCount" data-type="number" class="right">Courses <span class="sort-arrow">▾</span></th>
        <th data-key="matchedProposedSalary" data-type="number" class="right">Matched Salary <span class="sort-arrow">▾</span></th>
        <th data-key="computed_spend" data-type="number" class="right sorted">Spend <span class="sort-arrow">▾</span></th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>

  <div class="note">
    Teaching-focused faculty: lecturers, instructors, clinical. Research-focused: tenure-track and research professors.<br>
    Instructional % = estimated share of salary devoted to teaching (adjust with sliders above).<br>
    Only Grey Book faculty matched to CIS instructors are counted; &ldquo;% Teaching&rdquo; shows what fraction of Grey Book faculty are teaching this semester. Unmatched CIS instructors (TAs, adjuncts) excluded.<br>
    Click any row to expand details. Click column headers to sort.<br>
    Generated ${new Date().toISOString().slice(0, 10)}.
  </div>

  <div class="excluded-section" id="excludedSection" style="display:none">
    <h2>Excluded Departments</h2>
    <p style="font-size:0.8rem;color:#888;margin-bottom:12px">These departments were excluded from the main analysis due to data quality issues.</p>
    <table class="excluded-table">
      <thead><tr><th>Subject</th><th>Name</th><th>Grey Book</th><th>Faculty</th><th>% Teaching</th><th>Students</th><th>Reasons</th></tr></thead>
      <tbody id="excludedBody"></tbody>
    </table>
  </div>

  <div class="methodology">
    <h2>Methodology</h2>
    <ul>
      <li><strong>Faculty categories:</strong> Teaching-focused = lecturers, instructors, clinical faculty. Research-focused = tenure-track professors, research professors. Faculty with "other" titles (e.g., administrative) are excluded from instructional spend.</li>
      <li><strong>Salary &amp; FTE:</strong> The Grey Book already prorates salary by FTE (e.g., a 0.25 FTE professor shows 25% of full salary). Salaries are NOT multiplied by FTE again. Only faculty-class positions (AA/AB/AL/AM) are summed; administrative stipends (BA/BC) and zero-FTE endowed chair supplements are excluded.</li>
      <li><strong>Split appointments:</strong> The Grey Book lists each department's prorated share separately. There is no cross-department double-counting. A faculty member's salary is attributed to the department where they teach, not where their appointment originates.</li>
      <li><strong>Credit hours:</strong> Counted per course (not per section). A 3-credit course with 4 sections counts as 3 credit hours, not 12.</li>
      <li><strong>Variable-credit courses:</strong> The minimum listed credit value is used (e.g., "2 TO 4 hours" counts as 2).</li>
    </ul>

    <h2 style="margin-top:20px">Data Quality</h2>

    <h3 style="font-size:0.95rem;margin-top:12px;color:#555">Exclusion Criteria</h3>
    <ul>
      <li>Departments with <strong>0% match rate</strong> (no Grey Book faculty matched to CIS instructors) or <strong>fewer than 10 students</strong> are excluded from the main analysis and shown separately below.</li>
      <li><strong>Administrative units</strong> (e.g., BUS/Gies College of Business, ENG/Engineering Administration, EDUC/Education Administration, ACES, GLBL) are excluded because their Grey Book entries contain only administrative staff, endowed chair stipends (0% FTE), and college-wide positions&mdash;not teaching faculty. Their faculty teach under department-specific subject codes (e.g., Business faculty are in ACCY, BADM, FIN).</li>
    </ul>

    <h3 style="font-size:0.95rem;margin-top:12px;color:#555">Warning Badges</h3>
    <ul>
      <li><span class="warning-badge match-rate">few teaching</span> Fewer than 50% of Grey Book faculty are teaching this semester. Common in research-heavy departments.</li>
      <li><span class="warning-badge low-conf">low conf map</span> Department mapping was auto-generated with a similarity score below 0.6. The CIS&ndash;Grey Book pairing may be incorrect.</li>
      <li><span class="warning-badge ldap">LDAP errors</span> More than 10% of enrollment queries failed, so student counts may be understated.</li>
      <li><span class="warning-badge collision">name collision</span> Two or more Grey Book faculty share the same last name and first initial, making it impossible to distinguish who is teaching which section.</li>
    </ul>

    <h3 style="font-size:0.95rem;margin-top:12px;color:#555">Known Limitations</h3>
    <ul>
      <li><strong>Faculty not teaching this semester:</strong> In research-heavy departments, only 25&ndash;75% of Grey Book faculty teach in any given semester. This is expected&mdash;the analysis correctly counts only faculty who ARE teaching. However, it means the &ldquo;match rate&rdquo; reflects teaching load, not data quality. Departments like ENGL (36%), ME (45%), and LING (25%) have many faculty on sabbatical, doing lab/field work, or teaching in alternate semesters.</li>
      <li><strong>Multi-subject departments:</strong> Some Grey Book departments offer courses under multiple CIS subject codes. For example, &ldquo;Art &amp; Design&rdquo; (c14-d2) courses are split across ART, ARTD, ARTE, ARTF, ARTH, and ARTS, but only ART is mapped. This understates enrollment and overstates per-student costs for these departments. Similarly, &ldquo;Slavic Languages &amp; Literature&rdquo; maps only to SLCL, not the individual language codes.</li>
      <li><strong>CIS instructors not in Grey Book:</strong> Many CIS-listed instructors are graduate students, adjuncts, or visiting lecturers without Grey Book faculty appointments. Their salaries are not included. This means the analysis captures permanent faculty instructional spend but not total instructional labor costs.</li>
      <li><strong>Name matching:</strong> Faculty are matched by normalized last name and first initial. Multi-word and hyphenated last names are normalized (hyphens treated as spaces). However, if a name is stored differently across systems (e.g., one uses a middle component of a compound surname), the match may fail. Name collisions (two faculty with same last name + first initial) are flagged but not resolved.</li>
    </ul>
  </div>

  <script>
    const DATA = ${JSON.stringify(sorted)};
    const EXCLUDED = ${JSON.stringify(excluded)};

    let currentMetric = 'perStudent';
    let sortKey = 'computed_spend';
    let sortDir = -1;
    let searchTerm = '';
    let minStudents = 0;
    let minFaculty = 0;
    let minCourses = 0;
    let teachingPct = 0.7;
    let researchPct = 0.3;
    let expandedSubject = null;
    let chart = null;

    function computeSpend(r) {
      return r.matchedTeachingFocusedSalary * teachingPct + r.matchedResearchFocusedSalary * researchPct;
    }

    function computeMetric(r) {
      const spend = computeSpend(r);
      if (currentMetric === 'perStudent') return r.uniqueStudents > 0 ? spend / r.uniqueStudents : 0;
      if (currentMetric === 'perCreditHour') return r.totalCreditHours > 0 ? spend / r.totalCreditHours : 0;
      return spend;
    }

    function getSortValue(r, key) {
      if (key === 'computed_spend') return computeMetric(r);
      return r[key] ?? '';
    }

    function fmt$(n) { return '$' + Math.round(n).toLocaleString(); }
    function fmtPct(n) { return (n * 100).toFixed(0) + '%'; }

    function metricLabel() {
      if (currentMetric === 'perStudent') return 'Instructional Spend Per Student ($)';
      if (currentMetric === 'perCreditHour') return 'Instructional Spend Per Credit Hour ($)';
      return 'Total Instructional Spend ($)';
    }

    function filteredData() {
      let d = DATA.filter(r =>
        r.uniqueStudents >= minStudents &&
        r.matchedFaculty >= minFaculty &&
        r.courseCount >= minCourses
      );
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        d = d.filter(r =>
          r.cisSubject.toLowerCase().includes(q) ||
          r.cisName.toLowerCase().includes(q) ||
          r.grayBookName.toLowerCase().includes(q)
        );
      }
      const type = sortKey === 'computed_spend' ? 'number' : (document.querySelector('th[data-key="' + sortKey + '"]')?.dataset.type || 'number');
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
      const values = d.map(r => Math.round(computeMetric(r)));

      const container = document.querySelector('.chart-inner');
      container.style.minWidth = Math.max(800, d.length * 30) + 'px';

      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('spendChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: metricLabel(), data: values, backgroundColor: 'rgba(37, 99, 235, 0.8)' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: metricLabel() + ' (teaching ' + Math.round(teachingPct*100) + '%, research ' + Math.round(researchPct*100) + '%)', font: { size: 16 } },
            tooltip: { callbacks: { label: ctx => '$' + ctx.parsed.y.toLocaleString() } },
            legend: { display: false },
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

      // Update header label based on metric
      const prefix = currentMetric === 'perStudent' ? '$/Student' : currentMetric === 'perCreditHour' ? '$/Credit Hr' : 'Total Spend';
      document.querySelector('th[data-key="computed_spend"]').firstChild.textContent = prefix + ' ';

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
        const badges = [];
        if (r.dataQuality?.matchRateWarning) badges.push('<span class="warning-badge match-rate">few teaching</span>');
        if (r.dataQuality?.lowConfidenceMapping) badges.push('<span class="warning-badge low-conf">low conf map</span>');
        if (r.dataQuality?.ldapFailureRate > 0.1) badges.push('<span class="warning-badge ldap">LDAP errors</span>');
        if (r.dataQuality?.nameCollisions?.length > 0) badges.push('<span class="warning-badge collision">name collision</span>');
        tr.innerHTML = \`
          <td><strong>\${r.cisSubject}</strong>\${badges.join('')}</td>
          <td>\${r.cisName}</td>
          <td class="right">\${r.matchedFaculty}</td>
          <td class="right">\${fmtPct(r.matchRate)}</td>
          <td class="right">\${r.uniqueStudents.toLocaleString()}</td>
          <td class="right">\${r.courseCount}</td>
          <td class="right">\${fmt$(r.matchedProposedSalary)}</td>
          <td class="right">\${fmt$(computeMetric(r))}</td>
        \`;
        tr.addEventListener('click', () => toggleDetail(r.cisSubject));
        tbody.appendChild(tr);

        if (r.cisSubject === expandedSubject) {
          const detailTr = document.createElement('tr');
          detailTr.classList.add('detail-row');
          detailTr.innerHTML = \`<td colspan="8">\${renderDetail(r)}</td>\`;
          tbody.appendChild(detailTr);
        }
      }
    }

    function renderDetail(r) {
      const spend = computeSpend(r);
      const perStu = r.uniqueStudents > 0 ? spend / r.uniqueStudents : 0;
      const perCH = r.totalCreditHours > 0 ? spend / r.totalCreditHours : 0;
      return \`<div class="detail-content">
        <div class="detail-section">
          <h4>Faculty</h4>
          <dl>
            <dt>Teaching-focused</dt><dd>\${r.teachingFocusedCount}</dd>
            <dt>Research-focused</dt><dd>\${r.researchFocusedCount}</dd>
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
            <dt>Teaching-focused (matched)</dt><dd>\${fmt$(r.matchedTeachingFocusedSalary)}</dd>
            <dt>Research-focused (matched)</dt><dd>\${fmt$(r.matchedResearchFocusedSalary)}</dd>
            <dt>Instructional spend</dt><dd>\${fmt$(spend)}</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Enrollment</h4>
          <dl>
            <dt>Unique students</dt><dd>\${r.uniqueStudents.toLocaleString()}</dd>
            <dt>Courses</dt><dd>\${r.courseCount}</dd>
            <dt>Credit hours</dt><dd>\${r.totalCreditHours.toLocaleString()}</dd>
            <dt>$/student</dt><dd>\${fmt$(perStu)}</dd>
            <dt>$/credit hour</dt><dd>\${fmt$(perCH)}</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Mapping &amp; Cross-Check</h4>
          <dl>
            <dt>CIS Subject</dt><dd>\${r.cisSubject}</dd>
            <dt>Grey Book Dept</dt><dd>\${r.grayBookName}</dd>
            <dt>Grey Book ID</dt><dd>\${r.grayBookId}</dd>
            <dt>GPA confirmed</dt><dd>\${r.gpaConfirmed}/\${r.matchedFaculty}</dd>
            <dt>GPA-only instructors</dt><dd>\${r.gpaOnlyInstructors}</dd>
          </dl>
        </div>
      </div>\`;
    }

    function toggleDetail(subject) {
      expandedSubject = expandedSubject === subject ? null : subject;
      renderTable();
    }

    function renderExcluded() {
      const section = document.getElementById('excludedSection');
      const tbody = document.getElementById('excludedBody');
      if (!EXCLUDED || EXCLUDED.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';
      tbody.innerHTML = '';
      for (const r of EXCLUDED) {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${r.cisSubject}</td>
          <td>\${r.cisName}</td>
          <td>\${r.grayBookName}</td>
          <td class="right">\${r.totalFaculty}</td>
          <td class="right">\${fmtPct(r.matchRate)}</td>
          <td class="right">\${r.uniqueStudents.toLocaleString()}</td>
          <td>\${(r.dataQuality?.reasons || []).join('; ')}</td>
        \`;
        tbody.appendChild(tr);
      }
    }

    function render() {
      renderChart();
      renderTable();
      renderExcluded();
    }

    // Search
    document.getElementById('search').addEventListener('input', e => {
      searchTerm = e.target.value;
      render();
    });

    // Min filters
    document.getElementById('minStudents').addEventListener('input', e => {
      minStudents = parseInt(e.target.value) || 0;
      render();
    });
    document.getElementById('minFaculty').addEventListener('input', e => {
      minFaculty = parseInt(e.target.value) || 0;
      render();
    });
    document.getElementById('minCourses').addEventListener('input', e => {
      minCourses = parseInt(e.target.value) || 0;
      render();
    });

    // Sliders
    document.getElementById('teachingPct').addEventListener('input', e => {
      teachingPct = parseInt(e.target.value) / 100;
      document.getElementById('teachingPctVal').textContent = e.target.value + '%';
      render();
    });
    document.getElementById('researchPct').addEventListener('input', e => {
      researchPct = parseInt(e.target.value) / 100;
      document.getElementById('researchPctVal').textContent = e.target.value + '%';
      render();
    });

    // Metric toggle
    document.querySelectorAll('.metric-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metric-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMetric = btn.dataset.metric;
        sortKey = 'computed_spend';
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
