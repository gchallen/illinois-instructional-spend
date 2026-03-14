import { writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve } from "path"
import type { DepartmentAnalysis } from "./analysis"

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
  writeFileSync(resolve(OUTPUT_DIR, "results.json"), JSON.stringify(results.map(({ courseEnrollments, ...rest }) => rest), null, 2))

  const included = results.filter((r) => !r.dataQuality.excluded)
  const excluded = results.filter((r) => r.dataQuality.excluded)
  const sorted = [...included].filter((r) => r.uniqueStudents > 0).sort((a, b) => b.perStudent - a.perStudent)

  // Aggregate stats
  const totalTeachingSalary = sorted.reduce((s, r) => s + r.totalTeachingFocusedSalary, 0)
  const totalResearchSalary = sorted.reduce((s, r) => s + r.totalResearchFocusedSalary, 0)
  const totalStudents = sorted.reduce((s, r) => s + r.uniqueStudents, 0)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="${faviconDataUri()}">
  <title>UIUC Instructional Salary Spend — Spring 2026</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; }
    h1 { text-align: center; margin-bottom: 8px; font-size: 1.5rem; }
    .subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 0.9rem; }

    .summary-cards { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 16px; }
    .card { background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; min-width: 150px; }
    .card-label { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 1.2rem; font-weight: 700; }

    .controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; padding: 12px 16px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .controls label { font-size: 0.85rem; font-weight: 600; color: #555; }
    .controls input, .controls select { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; }
    .controls input[type="text"] { width: 200px; }
    .controls input[type="checkbox"] { margin-right: 4px; }
    .metric-toggle { display: flex; gap: 4px; }
    .metric-toggle button { padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
    .metric-toggle button.active { background: #2563eb; color: white; border-color: #2563eb; }
    .stat-pills { display: flex; gap: 8px; margin-left: auto; font-size: 0.8rem; color: #666; }
    .stat-pills span { background: #e5e7eb; padding: 3px 10px; border-radius: 12px; }

    .slider-group { display: flex; align-items: center; gap: 6px; }
    .slider-group input[type="range"] { width: 100px; }
    .slider-group .slider-val { font-size: 0.85rem; font-weight: 600; min-width: 32px; text-align: right; }

    .table-wrap { overflow: auto; max-height: 70vh; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; background: white; font-size: 0.8rem; }
    th { background: #2563eb; color: white; padding: 8px 6px; text-align: left; white-space: nowrap; cursor: pointer; user-select: none; position: sticky; top: 0; z-index: 2; }
    th:hover { background: #1d4ed8; }
    th .sort-arrow { opacity: 0.5; font-size: 0.7rem; margin-left: 3px; }
    th.sorted .sort-arrow { opacity: 1; }
    td { padding: 6px; border-bottom: 1px solid #eee; white-space: nowrap; }
    tr:hover td { background: #f0f4ff; }
    tr.expanded td { background: #e8eeff; }
    .right { text-align: right; }
    .detail-row td { padding: 0; background: #fafbff; }
    .detail-row:hover td { background: #fafbff; }
    .detail-content { padding: 12px 20px; font-size: 0.8rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
    .detail-section h4 { font-size: 0.85rem; color: #2563eb; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .detail-section dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; }
    .detail-section dt { color: #666; }
    .detail-section dd { font-weight: 600; text-align: right; }

    .bin-header td { background: #e8ecf1; font-weight: 700; font-size: 0.85rem; padding: 10px 6px; border-bottom: 2px solid #9db2d6; color: #333; cursor: pointer; }
    .bin-header:hover td { background: #dde3ec; }
    .bin-summary td { background: #f5f7fa; font-size: 0.78rem; color: #666; font-style: italic; border-bottom: 2px solid #e5e7eb; }
    .bin-summary:hover td { background: #f5f7fa; }

    .chart-section { margin-bottom: 20px; }
    .chart-section summary { cursor: pointer; font-weight: 600; font-size: 0.95rem; padding: 12px 16px; color: #555; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); list-style: none; }
    .chart-section summary::-webkit-details-marker { display: none; }
    .chart-section summary::before { content: '\\25B6'; margin-right: 8px; font-size: 0.7rem; display: inline-block; transition: transform 0.15s; }
    .chart-section[open] summary::before { transform: rotate(90deg); }
    .chart-section[open] summary { border-radius: 8px 8px 0 0; margin-bottom: 0; }
    .chart-container { background: white; border-radius: 0 0 8px 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .scatter-controls { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; font-size: 0.85rem; flex-wrap: wrap; }
    .scatter-controls label { font-weight: 600; color: #555; }
    .scatter-controls select { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; }
    #scatterPlot { display: block; }

    #tooltip { display: none; position: fixed; background: white; border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; font-size: 0.8rem; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1000; max-width: 280px; line-height: 1.5; }
    #tooltip strong { display: block; margin-bottom: 2px; }

    .note { margin-top: 16px; font-size: 0.8rem; color: #888; text-align: center; line-height: 1.5; }

    .warning-badge { display: inline-block; font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; margin-left: 4px; font-weight: 600; vertical-align: middle; }
    .warning-badge.enroll-err { background: #ede9fe; color: #5b21b6; }
    .warning-badge.collision { background: #e0e7ff; color: #3730a3; }
    .excluded-section { margin-top: 24px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .excluded-section h2 { font-size: 1.1rem; color: #666; margin-bottom: 12px; }
    .excluded-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .excluded-table th { background: #9ca3af; color: white; padding: 6px 8px; text-align: left; }
    .excluded-table td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    .methodology { margin-top: 24px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.8rem; color: #555; line-height: 1.6; }
    .methodology h2 { font-size: 1.1rem; color: #333; margin-bottom: 12px; }
    .methodology ul, .methodology ol { margin: 8px 0 8px 20px; }
    .methodology li { margin-bottom: 4px; }
    .assumption { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 4px 10px; margin: 4px 0; font-size: 0.85rem; color: #92400e; }

    .insights-section { background: white; border-radius: 8px; padding: 24px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; }
    .insights-section h2 { font-size: 1.2rem; color: #333; margin-bottom: 20px; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 28px; }
    .insight-panel { margin-bottom: 28px; }
    .insight-panel:last-of-type { margin-bottom: 12px; }
    .insight-panel h3 { font-size: 1.05rem; color: #1a1a1a; margin-bottom: 2px; font-weight: 700; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 28px; }
    .insight-panel .insight-takeaway { font-size: 1.05rem; color: #444; margin-bottom: 10px; line-height: 1.5; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 28px; }
    .insight-panel .insight-takeaway strong { color: #2563eb; }
    .insight-panel .insight-legend { font-size: 0.85rem; color: #999; margin-bottom: 6px; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 28px; }
    .insight-panel svg { display: block; }
    .insight-summary { font-size: 1rem; color: #444; line-height: 1.6; margin-top: 8px; padding-top: 14px; border-top: 1px solid #e5e7eb; max-width: 800px; margin-left: auto; margin-right: auto; padding-left: 28px; padding-right: 28px; }

    .parameters-section { background: white; border-radius: 8px; padding: 20px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; max-width: 800px; margin-left: auto; margin-right: auto; }
    .parameters-section h2 { font-size: 1.1rem; color: #333; margin-bottom: 16px; }
    .param-row { margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid #f0f0f0; }
    .param-row:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
    .param-name { font-size: 1.05rem; font-weight: 700; color: #333; margin-bottom: 8px; }
    .param-control { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .param-control input[type="range"] { flex: 1; }
    .param-control .slider-val { font-size: 0.85rem; font-weight: 600; min-width: 32px; text-align: right; }
    .param-desc { font-size: 0.95rem; color: #666; line-height: 1.5; }

    .tab-nav { display: flex; gap: 2px; }
    .tab-nav a { padding: 10px 24px; font-size: 0.9rem; font-weight: 600; color: #666; text-decoration: none; background: #e5e7eb; border-radius: 8px 8px 0 0; cursor: pointer; }
    .tab-nav a.active { background: white; color: #2563eb; box-shadow: 0 -1px 3px rgba(0,0,0,0.08); }
    .tab-content { display: none; border-radius: 0 8px 8px 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; background: white; }
    .tab-content.active { display: block; }
    .tab-content .controls { box-shadow: none; background: #f8f9fa; }
    .tab-content .table-wrap { box-shadow: none; margin-bottom: 0; }

    .param-summary { font-size: 0.8rem; color: #666; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; margin-bottom: 12px; }
    .param-summary strong { color: #333; }

    .size-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>UIUC Instructional Salary Spend Per Student</h1>
  <div class="subtitle">Spring 2026 — Grey Book Faculty Salaries &times; CIS Course Data &times; Enrollment</div>

  <div class="summary-cards">
    <div class="card">
      <div class="card-label">Teaching Spend</div>
      <div class="card-value" style="color:#2563eb" id="totalTeachingSpend"></div>
    </div>
    <div class="card">
      <div class="card-label">Research Spend</div>
      <div class="card-value" style="color:#7c3aed" id="totalResearchSpend"></div>
    </div>
    <div class="card">
      <div class="card-label">Non-Admin Faculty Salary</div>
      <div class="card-value" style="color:#333">$${Math.round(totalTeachingSalary + totalResearchSalary).toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Students</div>
      <div class="card-value" style="color:#333">${totalStudents.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Median $/Student</div>
      <div class="card-value" style="color:#059669" id="medianPerStudent"></div>
    </div>
    <div class="card">
      <div class="card-label">Mean $/Student</div>
      <div class="card-value" style="color:#059669" id="meanPerStudent"></div>
    </div>
  </div>

  <div class="parameters-section">
    <h2>Parameters</h2>
    <div class="param-row">
      <div class="param-name">Perspective</div>
      <div class="param-control">
        <span style="font-size:0.8rem;font-weight:600;color:#555">Divided</span>
        <input type="range" id="perspectiveSlider" min="0" max="100" value="50" step="5">
        <span style="font-size:0.8rem;font-weight:600;color:#555">Shared</span>
        <span class="slider-val" id="perspectiveVal" style="font-style:italic;min-width:90px;color:#888;font-weight:400">Balanced</span>
      </div>
      <div class="param-desc" style="display:flex;gap:24px">
        <div style="flex:1"><strong>Divided:</strong> If a department spends <strong>$X</strong> to run a course and <strong>Y students</strong> take it, each student receives <strong>$X/Y</strong> of instructional investment. Large courses divide the instructional investment.</div>
        <div style="flex:1"><strong>Shared:</strong> If a department spends <strong>$X</strong> to run a course and <strong>Y students</strong> take it, each student receives <strong>$X</strong> of instructional investment. Large courses multiply the instructional investment.</div>
      </div>
    </div>
    <div class="param-row">
      <div class="param-name">Teaching-focused %</div>
      <div class="param-control">
        <input type="range" id="teachingPct" min="0" max="100" value="70" step="5">
        <span class="slider-val" id="teachingPctVal">70%</span>
      </div>
      <div class="param-desc">Share of salary counted as teaching spend for teaching-focused faculty (lecturers, instructors, clinical). The remainder is classified as research spend.</div>
    </div>
    <div class="param-row">
      <div class="param-name">Research-focused %</div>
      <div class="param-control">
        <input type="range" id="researchPct" min="0" max="100" value="40" step="5">
        <span class="slider-val" id="researchPctVal">40%</span>
      </div>
      <div class="param-desc">Share of salary counted as teaching spend for research-focused faculty (tenure-track, research professors). The remainder is classified as research spend.</div>
    </div>
  </div>

  <div class="insights-section" id="insightsSection">
    <h2>Insights</h2>

    <div class="insight-panel">
      <h3>Instructional Investment by Enrollment Tier</h3>
      <p class="insight-takeaway">This chart responds to the <strong>Perspective</strong> parameter above. At $/Student, large-enrollment departments look efficient. At $/Course, the picture reverses. Within every tier, there&rsquo;s a wide spread &mdash; size isn&rsquo;t the whole story.</p>
      <p class="insight-legend" id="perspectiveLegend">Log scale. Each dot = one department. Vertical line = median, triangle = mean.</p>
      <svg id="stripPerspective"></svg>
    </div>

    <div class="insight-panel">
      <h3>Who Isn&rsquo;t Teaching?</h3>
      <p class="insight-takeaway">Between <strong>0% and 73%</strong> of a department&rsquo;s Grey Book faculty are not matched to any Spring 2026 CIS course section. Each dot shows the <strong>percentage of faculty</strong> with no course assignments. Their salary is not counted toward instructional spend &mdash; only faculty matched to courses contribute to the $/Student and $/Course figures above.</p>
      <p class="insight-legend">Linear scale (0&ndash;100%). Same bins as above.</p>
      <svg id="stripNotTeaching"></svg>
    </div>

    <p class="insight-summary" id="insightSummary"></p>
  </div>

  <div class="tab-nav">
    <a href="#table" class="tab-link">Table</a>
    <a href="#scatter" class="tab-link">Scatter Plot</a>
  </div>

  <div class="tab-content" id="tab-table">
    <div class="param-summary" id="paramSummaryTable"></div>
    <div class="controls">
      <label for="search">Search:</label>
      <input type="text" id="search" placeholder="e.g. Computer, Engineering, Music...">

      <label for="minStudents">Min students:</label>
      <input type="number" id="minStudents" value="0" min="0" style="width:80px">

      <label for="minFaculty">Min faculty:</label>
      <input type="number" id="minFaculty" value="0" min="0" style="width:80px">

      <label>Metric:</label>
      <div class="metric-toggle">
        <button class="active" data-metric="perStudent">$/Student</button>
        <button data-metric="perCreditHour">$/Credit Hr</button>
        <button data-metric="instructionalSpend">Total Spend</button>
        <button data-metric="perCourse">$/Course</button>
        <button data-metric="facultyStudentRatio">Faculty:Student</button>
      </div>

      <label><input type="checkbox" id="binToggle" checked> Group by enrollment</label>

      <div class="stat-pills">
        <span id="deptCount"></span>
        <span id="studentCount"></span>
      </div>
    </div>
    <div class="table-wrap">
  <table id="dataTable">
    <thead>
      <tr>
        <th data-key="grayBookName" data-type="string">Department <span class="sort-arrow">▾</span></th>
        <th data-key="totalFaculty" data-type="number" class="right">Faculty <span class="sort-arrow">▾</span></th>
        <th data-key="matchRate" data-type="number" class="right">% Teaching <span class="sort-arrow">▾</span></th>
        <th data-key="uniqueStudents" data-type="number" class="right">Students <span class="sort-arrow">▾</span></th>
        <th data-key="courseCount" data-type="number" class="right">Courses <span class="sort-arrow">▾</span></th>
        <th data-key="totalProposedSalary" data-type="number" class="right">Faculty Salary <span class="sort-arrow">▾</span></th>
        <th data-key="computed_spend" data-type="number" class="right sorted">Spend <span class="sort-arrow">▾</span></th>
        <th data-key="computed_teaching_pct" data-type="number" class="right">Teaching % <span class="sort-arrow">▾</span></th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  </div>
  </div>

  <div class="tab-content" id="tab-scatter">
    <div class="param-summary" id="paramSummaryScatter"></div>
    <div class="scatter-controls">
      <label for="scatterX">X axis:</label>
      <select id="scatterX"></select>
      <label for="scatterY">Y axis:</label>
      <select id="scatterY"></select>
    </div>
    <svg id="scatterPlot"></svg>
  </div>

  <div id="tooltip"></div>

  <div class="note">
    Teaching-focused faculty: lecturers, instructors, clinical. Research-focused: tenure-track and research professors.<br>
    Instructional % = estimated share of salary devoted to teaching (adjust with sliders above).<br>
    Teaching spend uses only <strong>matched</strong> faculty salary. Unmatched non-admin faculty salary is classified as research spend. Enrollment is counted across all CIS subjects where matched faculty teach.<br>
    Click any row to expand details. Click column headers to sort. Click bin headers to collapse/expand.<br>
    Generated ${new Date().toISOString().slice(0, 10)}.
  </div>

  <div class="excluded-section" id="excludedSection" style="display:none">
    <h2>Excluded Departments</h2>
    <p style="font-size:0.8rem;color:#888;margin-bottom:12px">Grey Book departments with no faculty positions (after filtering) are excluded.</p>
    <table class="excluded-table">
      <thead><tr><th>Department</th><th>Grey Book ID</th><th>Faculty</th><th>Students</th><th>Reasons</th></tr></thead>
      <tbody id="excludedBody"></tbody>
    </table>
  </div>

  <div class="methodology">
    <h2>Methodology</h2>

    <h3 style="font-size:1rem;margin-top:16px;color:#333">Worked Example</h3>
    <p style="line-height:1.7;margin-bottom:12px">
      Suppose the Grey Book lists <strong>Prof. Jane Smith</strong> with a total proposed salary of <strong>$120,000</strong> and a faculty type of <strong>tenure-track</strong> (research-focused). The Grey Book is used only to enumerate faculty and their salaries &mdash; not for departmental organization.
    </p>
    <div class="assumption">Assumption: The Grey Book is the source of truth for faculty names, salaries, and appointment types. We do not use the Grey Book&rsquo;s departmental groupings to determine which courses belong to which department.</div>
    <ol style="line-height:1.7;margin-bottom:12px;margin-left:20px">
      <li><strong>Faculty lookup.</strong> We search the Spring 2026 CIS course catalog for any instructor whose last name is &ldquo;Smith&rdquo; and first name starts with &ldquo;J&rdquo;. We find Prof. Smith listed as instructor on two courses: WIDG 101 (2 lecture sections) and WIDG 430 (1 section). Independent Study sections are excluded.
        <div class="assumption">Assumption: Faculty are matched by normalized last name + first initial. This can miss faculty whose names are recorded differently across systems, and cannot distinguish two faculty with the same last name and first initial.</div>
      </li>
      <li><strong>Match.</strong> Prof. Smith is now &ldquo;matched&rdquo; &mdash; she appears in both the Grey Book and CIS. Her salary counts toward instructional spend. A Grey Book faculty member who is not found in any CIS course section is &ldquo;unmatched,&rdquo; and their salary is not counted toward instructional spend at all.
        <div class="assumption">Assumption: If a faculty member is not listed as an instructor on any CIS course section, we treat their entire salary as non-instructional. In practice, some may be teaching courses not yet reflected in CIS.</div>
      </li>
      <li><strong>Teaching spend.</strong> As a research-focused faculty member, the Research-focused % slider determines how much of her salary is classified as teaching spend. At the default 40%, her teaching spend contribution is $120,000 &times; 0.40 = <strong>$48,000</strong>. The remaining $72,000 is classified as research spend.
        <div class="assumption">Assumption: The teaching/research split is uniform within each faculty category. In reality, individual faculty may devote more or less time to teaching. The sliders let you explore different assumptions.</div>
      </li>
      <li><strong>Per-course allocation.</strong> Prof. Smith teaches 2 courses, so her $48,000 teaching spend is split equally: <strong>$24,000</strong> to WIDG 101 and <strong>$24,000</strong> to WIDG 430. If another faculty member also teaches WIDG 101, their allocation is added to that course&rsquo;s total.
        <div class="assumption">Assumption: A faculty member&rsquo;s teaching spend is divided equally among the courses they teach. A large lecture and a small seminar by the same professor each receive the same allocation. We don&rsquo;t have data on per-course effort, so equal division is the simplest defensible choice.</div>
      </li>
      <li><strong>Enrollment.</strong> Unique students are counted across all non-excluded sections taught by matched faculty. A student enrolled in multiple sections or courses is counted once per department.</li>
      <li><strong>Metrics.</strong> The department&rsquo;s total teaching spend (summed across all matched faculty) is divided by either total unique students (Divided perspective) or total courses (Shared perspective), or a blend of both.</li>
    </ol>
    <p style="line-height:1.7;margin-bottom:12px">
      If Widget Studies had a second faculty member &mdash; say a lecturer (teaching-focused) earning $80,000 who teaches 3 courses &mdash; her teaching spend at 70% would be $56,000, split $18,667 per course. The department&rsquo;s total teaching spend would be $48,000 + $56,000 = <strong>$104,000</strong>. If the department has 500 unique students, the Divided metric would be $104,000 / 500 = <strong>$208/student</strong>.
    </p>

    <h3 style="font-size:1rem;margin-top:20px;color:#333">Data Sources</h3>
    <ul>
      <li><strong>Faculty salaries:</strong> The Grey Book (Academic Human Resources) lists every faculty appointment with title, FTE, and proposed salary. The Grey Book is used only to enumerate faculty and their salaries &mdash; departmental groupings in this analysis come from CIS course assignments, not Grey Book org structure. Only faculty-class positions (AA/AB/AL/AM) are included; administrative stipends (BA/BC) and zero-FTE endowed chair supplements are excluded. The Grey Book already prorates salary by FTE.</li>
      <li><strong>Course catalog:</strong> The CIS (Course Information Suite) provides the Spring 2026 course schedule including instructors, sections, and section types.</li>
      <li><strong>Enrollment:</strong> Student enrollment counts are sourced from university enrollment systems for each course section.</li>
    </ul>

    <h3 style="font-size:1rem;margin-top:20px;color:#333">Faculty Categories</h3>
    <ul>
      <li><strong>Teaching-focused:</strong> Lecturers, instructors, clinical faculty. Default instructional percentage: 70%.</li>
      <li><strong>Research-focused:</strong> Tenure-track professors, research professors. Default instructional percentage: 40%.</li>
      <li><strong>Other:</strong> Faculty with administrative or other titles are excluded from instructional spend entirely.</li>
      <li><strong>Unmatched:</strong> Faculty who appear in the Grey Book but are not found teaching any CIS course section. Their salary is not counted toward instructional spend.</li>
    </ul>

    <h3 style="font-size:1rem;margin-top:20px;color:#333">Key Decisions</h3>
    <ul>
      <li><strong>Section filtering:</strong> Independent Study sections (CIS type code &ldquo;IND&rdquo;) are excluded. These are typically thesis supervision or individual research, not classroom instruction. Faculty who only appear in IND sections are not counted as teaching.</li>
      <li><strong>Credit hours:</strong> Counted per course, not per section. A 3-credit course with 4 sections counts as 3 credit hours, not 12.</li>
    </ul>

    <h2 style="margin-top:24px">Data Quality</h2>

    <h3 style="font-size:0.95rem;margin-top:12px;color:#555">Warning Badges</h3>
    <ul>
      <li><span class="warning-badge collision">name collision</span> Two or more Grey Book faculty share the same last name and first initial, making it impossible to distinguish who is teaching which section.</li>
    </ul>

    <h3 style="font-size:0.95rem;margin-top:12px;color:#555">Known Limitations</h3>
    <ul>
      <li><strong>Name matching:</strong> Faculty are matched by normalized last name and first initial. Hyphenated/compound last names are normalized. If a name is stored differently across systems, the match may fail. Name collisions (two faculty with same last name + first initial) are flagged but not resolved.</li>
      <li><strong>Non-faculty instructors:</strong> Many CIS-listed instructors are graduate students, adjuncts, or visiting lecturers without Grey Book faculty appointments. Their salaries are not included. This analysis captures permanent faculty instructional spend, not total instructional labor costs.</li>
      <li><strong>Split appointments:</strong> The Grey Book lists each department&rsquo;s prorated share separately. There is no cross-department double-counting.</li>
    </ul>
  </div>

  <script>
    const DATA = ${JSON.stringify(sorted.map(r => { const { courseEnrollments, ...rest } = r; return rest; }))};
    const EXCLUDED = ${JSON.stringify(excluded.map(r => { const { courseEnrollments, ...rest } = r; return rest; }))};

    const ENROLLMENT_BINS = [
      { label: '< 100 students', min: 0, max: 100 },
      { label: '100 \\u2013 500 students', min: 100, max: 500 },
      { label: '500 \\u2013 1,000 students', min: 500, max: 1000 },
      { label: '1,000 \\u2013 5,000 students', min: 1000, max: 5000 },
      { label: '5,000+ students', min: 5000, max: Infinity },
    ];

    const BIN_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9'];

    const AXIS_OPTIONS = [
      { key: 'uniqueStudents', label: 'Students', get: r => r.uniqueStudents, fmt: n => n.toLocaleString() },
      { key: 'totalFaculty', label: 'Faculty Count', get: r => r.totalFaculty, fmt: n => String(n) },
      { key: 'matchedFaculty', label: 'Matched Faculty', get: r => r.matchedFaculty, fmt: n => String(n) },
      { key: 'matchRate', label: 'Match Rate', get: r => r.matchRate, fmt: n => (n * 100).toFixed(0) + '%' },
      { key: 'courseCount', label: 'Courses', get: r => r.courseCount, fmt: n => String(n) },
      { key: 'totalProposedSalary', label: 'Faculty Salary', get: r => r.totalProposedSalary, fmt: fmt$ },
      { key: 'computed_metric', label: 'Current Metric', get: r => computeMetric(r), fmt: n => fmtCurrentMetric(n) },
      { key: 'computedSpend', label: 'Teaching Spend', get: r => computeSpend(r), fmt: fmt$ },
      { key: 'computedResearch', label: 'Research Spend', get: r => computeResearchSpend(r), fmt: fmt$ },
      { key: 'computedTeachingPct', label: 'Teaching %', get: r => computeTeachingPct(r), fmt: fmtPct },
      { key: 'perCourse', label: '$/Course', get: r => avgPerCourseSpend(r), fmt: fmt$ },
      { key: 'facultyStudentRatio', label: 'Faculty:Student Ratio', get: r => r.uniqueStudents > 0 ? r.matchedFaculty / r.uniqueStudents : 0, fmt: n => n > 0 ? '1:' + Math.round(1 / n) : '0' },
      { key: 'notTeachingPct', label: '% Not Teaching', get: r => 1 - r.matchRate, fmt: fmtPct },
    ];

    let currentMetric = 'perStudent';
    let sortKey = 'computed_spend';
    let sortDir = -1;
    let searchTerm = '';
    let minStudents = 0;
    let minFaculty = 0;
    let teachingPct = 0.7;
    let researchPct = 0.4;
    let expandedId = null;
    let binsEnabled = true;
    let collapsedBins = new Set();
    let perspectiveAlpha = 0.5;
    let currentXAxis = 'uniqueStudents';
    let currentYAxis = 'computed_metric';

    function computeSpend(r) {
      return (r.matchedTeachingFocusedSalary || 0) * teachingPct + (r.matchedResearchFocusedSalary || 0) * researchPct;
    }

    function computeResearchSpend(r) {
      return (r.matchedTeachingFocusedSalary || 0) * (1 - teachingPct)
           + (r.matchedResearchFocusedSalary || 0) * (1 - researchPct)
           + (r.unmatchedNonAdminSalary || 0);
    }

    function computeTeachingPct(r) {
      const t = computeSpend(r);
      const res = computeResearchSpend(r);
      const total = t + res;
      return total > 0 ? t / total : 0;
    }

    function computePerCourseSpend(r) {
      var result = {};
      var fc = r.facultyCourses || [];
      for (var i = 0; i < fc.length; i++) {
        var pct = fc[i].facultyType === 'teaching' ? teachingPct : researchPct;
        var perCourse = fc[i].salary * pct / (fc[i].courseKeys.length || 1);
        for (var j = 0; j < fc[i].courseKeys.length; j++) {
          var key = fc[i].courseKeys[j];
          result[key] = (result[key] || 0) + perCourse;
        }
      }
      return result;
    }

    function avgPerCourseSpend(r) {
      var courseSpends = computePerCourseSpend(r);
      var values = Object.values(courseSpends);
      if (values.length === 0) {
        // Fallback to uniform division if no facultyCourses data
        var spend = computeSpend(r);
        return r.courseCount > 0 ? spend / r.courseCount : 0;
      }
      return values.reduce(function(a, b) { return a + b; }, 0) / values.length;
    }

    function blendedPerspective(r, alpha) {
      var perStu = r.uniqueStudents > 0 ? computeSpend(r) / r.uniqueStudents : 0;
      var perCrs = avgPerCourseSpend(r);
      if (perStu <= 0 || perCrs <= 0) return alpha < 0.5 ? perStu : perCrs;
      // Geometric interpolation — smooth on log scale
      return Math.pow(perStu, 1 - alpha) * Math.pow(perCrs, alpha);
    }

    function computeMetric(r) {
      const spend = computeSpend(r);
      if (currentMetric === 'perStudent') return r.uniqueStudents > 0 ? spend / r.uniqueStudents : 0;
      if (currentMetric === 'perCreditHour') return r.totalCreditHours > 0 ? spend / r.totalCreditHours : 0;
      if (currentMetric === 'perCourse') return avgPerCourseSpend(r);
      if (currentMetric === 'facultyStudentRatio') return r.uniqueStudents > 0 ? r.matchedFaculty / r.uniqueStudents : 0;
      return spend;
    }

    function getSortValue(r, key) {
      if (key === 'computed_spend') return computeMetric(r);
      if (key === 'computed_teaching_pct') return computeTeachingPct(r);
      return r[key] ?? '';
    }

    function fmt$(n) { return '$' + Math.round(n).toLocaleString(); }
    function fmtPct(n) { return (n * 100).toFixed(0) + '%'; }

    function fmtCurrentMetric(v) {
      if (currentMetric === 'facultyStudentRatio') {
        return v > 0 ? '1:' + Math.round(1 / v) : '0';
      }
      return fmt$(v);
    }

    function median(arr) {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    function mean(arr) {
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    function metricLabel() {
      if (currentMetric === 'perStudent') return '$/Student';
      if (currentMetric === 'perCreditHour') return '$/Credit Hour';
      if (currentMetric === 'perCourse') return '$/Course';
      if (currentMetric === 'facultyStudentRatio') return 'Faculty per Student';
      return 'Total Spend';
    }

    function getBinIndex(students) {
      for (let i = 0; i < ENROLLMENT_BINS.length; i++) {
        if (students >= ENROLLMENT_BINS[i].min && students < ENROLLMENT_BINS[i].max) return i;
      }
      return ENROLLMENT_BINS.length - 1;
    }

    function filteredData() {
      let d = DATA.filter(r =>
        r.uniqueStudents >= minStudents &&
        r.totalFaculty >= minFaculty
      );
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        d = d.filter(r =>
          r.grayBookName.toLowerCase().includes(q) ||
          (r.cisSubjects || []).some(s => s.toLowerCase().includes(q))
        );
      }
      const type = sortKey === 'computed_spend' || sortKey === 'computed_teaching_pct' ? 'number' : (document.querySelector('th[data-key="' + sortKey + '"]')?.dataset.type || 'number');
      d.sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        if (type === 'string') return sortDir * String(va).localeCompare(String(vb));
        return sortDir * ((va || 0) - (vb || 0));
      });
      return d;
    }

    function renderTable() {
      const d = filteredData();
      const tbody = document.querySelector('#dataTable tbody');
      tbody.innerHTML = '';

      document.getElementById('deptCount').textContent = d.length + ' depts';
      document.getElementById('studentCount').textContent = d.reduce((s, r) => s + r.uniqueStudents, 0).toLocaleString() + ' students';

      const prefix = currentMetric === 'perStudent' ? '$/Student' : currentMetric === 'perCreditHour' ? '$/Credit Hr' : currentMetric === 'perCourse' ? '$/Course' : currentMetric === 'facultyStudentRatio' ? 'Faculty:Student' : 'Total Spend';
      document.querySelector('th[data-key="computed_spend"]').firstChild.textContent = prefix + ' ';

      document.querySelectorAll('#dataTable th').forEach(th => {
        th.classList.toggle('sorted', th.dataset.key === sortKey);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow && th.dataset.key === sortKey) {
          arrow.textContent = sortDir === 1 ? '\\u25B4' : '\\u25BE';
        }
      });

      if (binsEnabled) {
        renderBinnedRows(d, tbody);
      } else {
        renderFlatRows(d, tbody);
      }
    }

    function renderFlatRows(d, tbody) {
      for (const r of d) {
        appendDeptRow(r, tbody);
      }
    }

    function renderBinnedRows(d, tbody) {
      const bins = ENROLLMENT_BINS.map((bin, i) => ({
        ...bin,
        index: i,
        departments: d.filter(r => r.uniqueStudents >= bin.min && r.uniqueStudents < bin.max),
      })).filter(g => g.departments.length > 0).reverse();

      for (const bin of bins) {
        const metrics = bin.departments.map(r => computeMetric(r));
        const med = median(metrics);
        const avg = mean(metrics);
        const totalStu = bin.departments.reduce((s, r) => s + r.uniqueStudents, 0);
        const collapsed = collapsedBins.has(bin.index);

        // Bin header row
        const hdr = document.createElement('tr');
        hdr.classList.add('bin-header');
        hdr.innerHTML = \`
          <td colspan="4"><span style="font-size:0.75rem;margin-right:6px">\${collapsed ? '\\u25B6' : '\\u25BC'}</span>\${bin.label} <span style="font-weight:400;color:#666">(\${bin.departments.length} depts, \${totalStu.toLocaleString()} students)</span></td>
          <td class="right" colspan="2" style="font-weight:400;color:#666">Median \${metricLabel()}: \${fmtCurrentMetric(med)}</td>
          <td class="right" colspan="2" style="font-weight:400;color:#666">Mean: \${fmtCurrentMetric(avg)}</td>
        \`;
        hdr.addEventListener('click', () => {
          if (collapsedBins.has(bin.index)) collapsedBins.delete(bin.index);
          else collapsedBins.add(bin.index);
          renderTable();
        });
        tbody.appendChild(hdr);

        if (!collapsed) {
          for (const r of bin.departments) {
            appendDeptRow(r, tbody);
          }
        }
      }
    }

    function appendDeptRow(r, tbody) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.dataset.id = r.grayBookId;
      if (r.grayBookId === expandedId) tr.classList.add('expanded');
      const binIdx = getBinIndex(r.uniqueStudents);
      const sizeDot = '<span class="size-dot" style="background:' + BIN_COLORS[binIdx] + '" title="' + ENROLLMENT_BINS[binIdx].label + '"></span>';
      const badges = [];
      if (r.dataQuality?.ldapFailureRate > 0.1) badges.push('<span class="warning-badge enroll-err">Enrollment data errors</span>');
      if (r.dataQuality?.nameCollisions?.length > 0) badges.push('<span class="warning-badge collision">name collision</span>');
      const subjects = (r.cisSubjects || []).join(', ');
      tr.innerHTML = \`
        <td>\${sizeDot}<strong>\${r.grayBookName}</strong>\${badges.join('')}<br><span style="font-size:0.7rem;color:#888;margin-left:13px">\${subjects}</span></td>
        <td class="right">\${r.totalFaculty} <span style="color:#888">(\${r.matchedFaculty})</span></td>
        <td class="right">\${fmtPct(r.matchRate)}</td>
        <td class="right">\${r.uniqueStudents.toLocaleString()}</td>
        <td class="right">\${r.courseCount}</td>
        <td class="right">\${fmt$(r.totalProposedSalary)}</td>
        <td class="right">\${fmtCurrentMetric(computeMetric(r))}</td>
        <td class="right">\${fmtPct(computeTeachingPct(r))}</td>
      \`;
      tr.addEventListener('click', () => toggleDetail(r.grayBookId));
      tbody.appendChild(tr);

      if (r.grayBookId === expandedId) {
        const detailTr = document.createElement('tr');
        detailTr.classList.add('detail-row');
        detailTr.innerHTML = \`<td colspan="8">\${renderDetail(r)}</td>\`;
        tbody.appendChild(detailTr);
      }
    }

    function renderDetail(r) {
      const tSpend = computeSpend(r);
      const rSpend = computeResearchSpend(r);
      const nonAdminSalary = r.totalTeachingFocusedSalary + r.totalResearchFocusedSalary;
      const tPct = nonAdminSalary > 0 ? tSpend / nonAdminSalary : 0;
      const rPct = nonAdminSalary > 0 ? rSpend / nonAdminSalary : 0;
      const perStu = r.uniqueStudents > 0 ? tSpend / r.uniqueStudents : 0;
      const perCH = r.totalCreditHours > 0 ? tSpend / r.totalCreditHours : 0;
      var courseBreakdown = '';
      var courseSpends = computePerCourseSpend(r);
      var courseKeys = Object.keys(courseSpends);
      if (courseKeys.length > 0) {
        courseKeys.sort(function(a, b) { return courseSpends[b] - courseSpends[a]; });
        var courseRows = courseKeys.map(function(key) {
          return '<dt>' + key + '</dt><dd>' + fmt$(courseSpends[key]) + '</dd>';
        }).join('');
        courseBreakdown = \`<div class="detail-section">
          <h4>Per-Course Allocation</h4>
          <dl>\${courseRows}</dl>
        </div>\`;
      }

      return \`<div class="detail-content">
        <div class="detail-section">
          <h4>Faculty</h4>
          <dl>
            <dt>Teaching-focused</dt><dd>\${r.teachingFocusedCount}</dd>
            <dt>Research-focused</dt><dd>\${r.researchFocusedCount}</dd>
            <dt>Total in Grey Book</dt><dd>\${r.totalFaculty}</dd>
            <dt>Matched to CIS</dt><dd>\${r.matchedFaculty} (\${fmtPct(r.matchRate)})</dd>
          </dl>
        </div>
        <div class="detail-section">
          <h4>Salary Breakdown</h4>
          <dl>
            <dt>Teaching spend</dt><dd>\${fmt$(tSpend)} (\${fmtPct(tPct)})</dd>
            <dt>Research spend</dt><dd>\${fmt$(rSpend)} (\${fmtPct(rPct)})</dd>
            <dt style="border-top:1px solid #ddd;padding-top:4px;margin-top:4px">Non-admin faculty salary</dt><dd style="border-top:1px solid #ddd;padding-top:4px;margin-top:4px">\${fmt$(nonAdminSalary)}</dd>
            <dt style="margin-top:8px">Matched teaching-focused</dt><dd>\${fmt$(r.matchedTeachingFocusedSalary || 0)}</dd>
            <dt>Matched research-focused</dt><dd>\${fmt$(r.matchedResearchFocusedSalary || 0)}</dd>
            <dt>Unmatched non-admin</dt><dd>\${fmt$(r.unmatchedNonAdminSalary || 0)}</dd>
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
        \${courseBreakdown}
        <div class="detail-section">
          <h4>Identity</h4>
          <dl>
            <dt>Grey Book ID</dt><dd>\${r.grayBookId}</dd>
            <dt>CIS subjects</dt><dd>\${(r.cisSubjects || []).join(', ') || 'none'}</dd>
          </dl>
        </div>
      </div>\`;
    }

    function toggleDetail(id) {
      expandedId = expandedId === id ? null : id;
      renderTable();
    }

    // Scatter plot
    function niceMax(val) {
      if (val <= 0) return 1;
      const mag = Math.pow(10, Math.floor(Math.log10(val)));
      const norm = val / mag;
      if (norm <= 1) return mag;
      if (norm <= 2) return 2 * mag;
      if (norm <= 5) return 5 * mag;
      return 10 * mag;
    }

    function niceTicks(max, count) {
      if (max <= 0) return [0];
      const raw = max / count;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      let step;
      if (norm <= 1) step = mag;
      else if (norm <= 2) step = 2 * mag;
      else if (norm <= 5) step = 5 * mag;
      else step = 10 * mag;
      const ticks = [];
      for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(v);
      return ticks;
    }

    function renderChart() {
      const ns = 'http://www.w3.org/2000/svg';
      const d = filteredData();
      const svg = document.getElementById('scatterPlot');
      svg.innerHTML = '';

      if (d.length === 0) return;

      const xOpt = AXIS_OPTIONS.find(o => o.key === currentXAxis);
      const yOpt = AXIS_OPTIONS.find(o => o.key === currentYAxis);
      if (!xOpt || !yOpt) return;

      const margin = { top: 16, right: 30, bottom: 48, left: 72 };
      const width = 700;
      const height = 420;
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.style.width = '100%';
      svg.style.maxWidth = width + 'px';

      const points = d.map(r => ({
        x: xOpt.get(r),
        y: yOpt.get(r),
        r: r,
        bin: getBinIndex(r.uniqueStudents),
      }));

      const xMax = niceMax(Math.max(...points.map(p => p.x), 1));
      const yMax = niceMax(Math.max(...points.map(p => p.y), 1));

      function sx(v) { return margin.left + (v / xMax) * plotW; }
      function sy(v) { return margin.top + plotH - (v / yMax) * plotH; }

      // X axis ticks
      const xTicks = niceTicks(xMax, 5);
      for (const v of xTicks) {
        // Tick line
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', sx(v)); tick.setAttribute('x2', sx(v));
        tick.setAttribute('y1', sy(0)); tick.setAttribute('y2', sy(0) + 4);
        tick.setAttribute('stroke', '#999'); tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);
        // Light grid line
        if (v > 0) {
          const grid = document.createElementNS(ns, 'line');
          grid.setAttribute('x1', sx(v)); grid.setAttribute('x2', sx(v));
          grid.setAttribute('y1', sy(0)); grid.setAttribute('y2', sy(yMax));
          grid.setAttribute('stroke', '#eee'); grid.setAttribute('stroke-width', '1');
          svg.appendChild(grid);
        }
        // Label
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', sx(v));
        label.setAttribute('y', sy(0) + 18);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#888');
        label.textContent = xOpt.fmt(v);
        svg.appendChild(label);
      }

      // Y axis ticks
      const yTicks = niceTicks(yMax, 5);
      for (const v of yTicks) {
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', sx(0) - 4); tick.setAttribute('x2', sx(0));
        tick.setAttribute('y1', sy(v)); tick.setAttribute('y2', sy(v));
        tick.setAttribute('stroke', '#999'); tick.setAttribute('stroke-width', '1');
        svg.appendChild(tick);
        if (v > 0) {
          const grid = document.createElementNS(ns, 'line');
          grid.setAttribute('x1', sx(0)); grid.setAttribute('x2', sx(xMax));
          grid.setAttribute('y1', sy(v)); grid.setAttribute('y2', sy(v));
          grid.setAttribute('stroke', '#eee'); grid.setAttribute('stroke-width', '1');
          svg.appendChild(grid);
        }
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', sx(0) - 8);
        label.setAttribute('y', sy(v) + 3);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#888');
        label.textContent = yOpt.fmt(v);
        svg.appendChild(label);
      }

      // Axis lines
      const xAxis = document.createElementNS(ns, 'line');
      xAxis.setAttribute('x1', sx(0)); xAxis.setAttribute('x2', sx(xMax));
      xAxis.setAttribute('y1', sy(0)); xAxis.setAttribute('y2', sy(0));
      xAxis.setAttribute('stroke', '#999'); xAxis.setAttribute('stroke-width', '1');
      svg.appendChild(xAxis);
      const yAxis = document.createElementNS(ns, 'line');
      yAxis.setAttribute('x1', sx(0)); yAxis.setAttribute('x2', sx(0));
      yAxis.setAttribute('y1', sy(0)); yAxis.setAttribute('y2', sy(yMax));
      yAxis.setAttribute('stroke', '#999'); yAxis.setAttribute('stroke-width', '1');
      svg.appendChild(yAxis);

      // Axis labels
      const xLabel = document.createElementNS(ns, 'text');
      xLabel.setAttribute('x', margin.left + plotW / 2);
      xLabel.setAttribute('y', height - 4);
      xLabel.setAttribute('text-anchor', 'middle');
      xLabel.setAttribute('font-size', '12');
      xLabel.setAttribute('fill', '#555');
      xLabel.textContent = xOpt.label;
      svg.appendChild(xLabel);

      const yLabel = document.createElementNS(ns, 'text');
      yLabel.setAttribute('x', 14);
      yLabel.setAttribute('y', margin.top + plotH / 2);
      yLabel.setAttribute('text-anchor', 'middle');
      yLabel.setAttribute('font-size', '12');
      yLabel.setAttribute('fill', '#555');
      yLabel.setAttribute('transform', 'rotate(-90, 14, ' + (margin.top + plotH / 2) + ')');
      yLabel.textContent = yOpt.label;
      svg.appendChild(yLabel);

      // Data points
      const tooltip = document.getElementById('tooltip');
      for (const p of points) {
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', sx(p.x));
        dot.setAttribute('cy', sy(p.y));
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', BIN_COLORS[p.bin]);
        dot.setAttribute('opacity', '0.7');
        dot.setAttribute('stroke', 'white');
        dot.setAttribute('stroke-width', '1');
        dot.style.cursor = 'pointer';
        dot.addEventListener('mouseenter', e => {
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY - 10) + 'px';
          tooltip.innerHTML = '<strong>' + p.r.grayBookName + '</strong>'
            + xOpt.label + ': ' + xOpt.fmt(p.x) + '<br>'
            + yOpt.label + ': ' + yOpt.fmt(p.y) + '<br>'
            + '<span style="color:#888">' + ENROLLMENT_BINS[p.bin].label + '</span>';
        });
        dot.addEventListener('mousemove', e => {
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY - 10) + 'px';
        });
        dot.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
        svg.appendChild(dot);
      }

      // Bin legend (compact, bottom-right)
      const usedBins = [...new Set(points.map(p => p.bin))].sort();
      usedBins.forEach((bi, i) => {
        const lx = sx(xMax) - 10;
        const ly = margin.top + 6 + i * 16;
        const swatch = document.createElementNS(ns, 'circle');
        swatch.setAttribute('cx', lx - 4);
        swatch.setAttribute('cy', ly);
        swatch.setAttribute('r', '4');
        swatch.setAttribute('fill', BIN_COLORS[bi]);
        swatch.setAttribute('opacity', '0.7');
        svg.appendChild(swatch);
        const lt = document.createElementNS(ns, 'text');
        lt.setAttribute('x', lx - 12);
        lt.setAttribute('y', ly + 4);
        lt.setAttribute('text-anchor', 'end');
        lt.setAttribute('font-size', '10');
        lt.setAttribute('fill', '#888');
        lt.textContent = ENROLLMENT_BINS[bi].label;
        svg.appendChild(lt);
      });
    }

    function perspectiveLabel() {
      if (perspectiveAlpha === 0) return 'Divided ($/Student)';
      if (perspectiveAlpha >= 1) return 'Shared ($/Course)';
      return 'Divided \u2194 Shared (' + Math.round(perspectiveAlpha * 100) + '% toward Shared)';
    }

    function renderInsights() {
      var label = perspectiveLabel();
      renderBinnedStrip('stripPerspective',
        function(r) { return blendedPerspective(r, perspectiveAlpha); },
        fmt$, label, true);
      var legendEl = document.getElementById('perspectiveLegend');
      if (perspectiveAlpha === 0) {
        legendEl.textContent = 'Log scale. Each dot = one department. Vertical line = median, triangle = mean.';
      } else if (perspectiveAlpha >= 1) {
        legendEl.textContent = 'Log scale. Each dot = average allocated spend per course for one department. Faculty salary split equally across courses they teach.';
      } else {
        legendEl.textContent = 'Log scale. Geometric blend of $/Student and $/Course (slide to see each perspective). Vertical line = median, triangle = mean.';
      }
      renderBinnedStrip('stripNotTeaching',
        function(r) { return 1 - r.matchRate; },
        fmtPct, '% Not Teaching', false);
      renderInsightSummary();
    }

    function renderBinnedStrip(svgId, valueFn, fmtFn, axisLabel, useLog) {
      const ns = 'http://www.w3.org/2000/svg';
      const d = filteredData();
      const svg = document.getElementById(svgId);
      svg.innerHTML = '';

      const bins = ENROLLMENT_BINS.map((bin, i) => ({
        ...bin,
        index: i,
        departments: d.filter(r => r.uniqueStudents >= bin.min && r.uniqueStudents < bin.max),
      })).filter(g => g.departments.length > 0).reverse();

      if (bins.length === 0) return;

      const margin = { top: 8, right: 20, bottom: 32, left: 150 };
      const rowHeight = 36;
      const width = 1100;
      const height = margin.top + bins.length * rowHeight + margin.bottom;
      const plotW = width - margin.left - margin.right;

      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.style.width = '100%';
      svg.style.height = 'auto';

      const allValues = d.map(r => valueFn(r));
      const positiveValues = allValues.filter(v => v > 0);
      if (useLog && positiveValues.length === 0) return;

      var sx, ticks;
      if (useLog) {
        var logMin = Math.floor(Math.log10(Math.min(...positiveValues)));
        var logMax = Math.ceil(Math.log10(Math.max(...positiveValues)));
        if (logMin === logMax) logMax = logMin + 1;
        sx = function(v) {
          if (v <= 0) return margin.left;
          return margin.left + Math.max(0, Math.min(1, (Math.log10(v) - logMin) / (logMax - logMin))) * plotW;
        };
        ticks = [];
        for (var p = logMin; p <= logMax; p++) ticks.push(Math.pow(10, p));
      } else {
        var maxVal = Math.max(...allValues);
        if (maxVal <= 1.01) maxVal = 1;
        else maxVal = niceMax(maxVal);
        sx = function(v) {
          return margin.left + Math.max(0, Math.min(1, v / maxVal)) * plotW;
        };
        if (maxVal <= 1) {
          ticks = [0, 0.25, 0.5, 0.75, 1.0];
        } else {
          ticks = niceTicks(maxVal, 4);
        }
      }

      for (var ti = 0; ti < ticks.length; ti++) {
        var v = ticks[ti];
        var grid = document.createElementNS(ns, 'line');
        grid.setAttribute('x1', sx(v)); grid.setAttribute('x2', sx(v));
        grid.setAttribute('y1', margin.top); grid.setAttribute('y2', margin.top + bins.length * rowHeight);
        grid.setAttribute('stroke', '#ddd'); grid.setAttribute('stroke-width', '1');
        svg.appendChild(grid);
        var label = document.createElementNS(ns, 'text');
        label.setAttribute('x', sx(v));
        label.setAttribute('y', margin.top + bins.length * rowHeight + 16);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#888');
        label.textContent = fmtFn(v);
        svg.appendChild(label);
      }

      const xLabel = document.createElementNS(ns, 'text');
      xLabel.setAttribute('x', margin.left + plotW / 2);
      xLabel.setAttribute('y', height - 2);
      xLabel.setAttribute('text-anchor', 'middle');
      xLabel.setAttribute('font-size', '10');
      xLabel.setAttribute('fill', '#666');
      xLabel.textContent = axisLabel;
      svg.appendChild(xLabel);

      const tooltip = document.getElementById('tooltip');
      bins.forEach(function(bin, i) {
        const y = margin.top + i * rowHeight + rowHeight / 2;
        const depts = bin.departments;
        const values = depts.map(r => valueFn(r));
        const med = median(values);
        const avg = mean(values);

        if (i % 2 === 0) {
          const bg = document.createElementNS(ns, 'rect');
          bg.setAttribute('x', '0'); bg.setAttribute('y', margin.top + i * rowHeight);
          bg.setAttribute('width', width); bg.setAttribute('height', rowHeight);
          bg.setAttribute('fill', '#f8f9fa');
          svg.appendChild(bg);
        }

        const lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', margin.left - 6);
        lbl.setAttribute('y', y + 4);
        lbl.setAttribute('text-anchor', 'end');
        lbl.setAttribute('font-size', '11');
        lbl.setAttribute('fill', '#555');
        lbl.textContent = bin.label + ' (' + depts.length + ')';
        svg.appendChild(lbl);

        depts.forEach(function(r, j) {
          const v = valueFn(r);
          const yOff = ((j % 3) - 1) * 5;
          const dot = document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', sx(v));
          dot.setAttribute('cy', y + yOff);
          dot.setAttribute('r', '4');
          dot.setAttribute('fill', BIN_COLORS[bin.index]);
          dot.setAttribute('opacity', '0.6');
          dot.style.cursor = 'pointer';
          dot.addEventListener('mouseenter', function(e) {
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 10) + 'px';
            tooltip.innerHTML = '<strong>' + r.grayBookName + '</strong>' + axisLabel + ': ' + fmtFn(v);
          });
          dot.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 10) + 'px';
          });
          dot.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });
          svg.appendChild(dot);
        });

        const medLine = document.createElementNS(ns, 'line');
        medLine.setAttribute('x1', sx(med)); medLine.setAttribute('x2', sx(med));
        medLine.setAttribute('y1', y - 13); medLine.setAttribute('y2', y + 13);
        medLine.setAttribute('stroke', '#333'); medLine.setAttribute('stroke-width', '2');
        svg.appendChild(medLine);

        const tri = document.createElementNS(ns, 'polygon');
        const tx = sx(avg);
        tri.setAttribute('points', (tx - 4) + ',' + (y + 14) + ' ' + (tx + 4) + ',' + (y + 14) + ' ' + tx + ',' + (y + 8));
        tri.setAttribute('fill', '#333');
        svg.appendChild(tri);
      });
    }

    function renderInsightSummary() {
      const d = filteredData();
      const el = document.getElementById('insightSummary');

      const perStudentVals = d.filter(r => r.uniqueStudents > 0).map(r => computeSpend(r) / r.uniqueStudents);
      const med = median(perStudentVals);
      const avg = mean(perStudentVals);

      const ratios = d.filter(r => r.uniqueStudents > 0 && r.matchedFaculty > 0).map(r => ({
        ratio: r.matchedFaculty / r.uniqueStudents,
        name: r.grayBookName,
        inverse: Math.round(r.uniqueStudents / r.matchedFaculty),
      }));
      ratios.sort(function(a, b) { return b.ratio - a.ratio; });

      const notTeachingHigh = d.filter(r => r.matchRate < 0.5);

      var text = 'Median instructional spend: <strong>' + fmt$(med) + '/student</strong> (mean: ' + fmt$(avg) + '). ';
      if (ratios.length >= 2) {
        text += 'Instructor:student ratio ranges from <strong>1:' + ratios[0].inverse + '</strong> (' + ratios[0].name + ') to <strong>1:' + ratios[ratios.length - 1].inverse + '</strong> (' + ratios[ratios.length - 1].name + '). ';
      }
      text += '<strong>' + notTeachingHigh.length + '</strong> department' + (notTeachingHigh.length !== 1 ? 's' : '') + ' ha' + (notTeachingHigh.length !== 1 ? 've' : 's') + ' more than half their faculty not teaching any courses.';
      el.innerHTML = text;
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
          <td>\${r.grayBookName}</td>
          <td>\${r.grayBookId}</td>
          <td class="right">\${r.totalFaculty}</td>
          <td class="right">\${r.uniqueStudents.toLocaleString()}</td>
          <td>\${(r.dataQuality?.reasons || []).join('; ')}</td>
        \`;
        tbody.appendChild(tr);
      }
    }

    function updateSummaryCards() {
      const d = filteredData();
      const aggTeaching = d.reduce((s, r) => s + computeSpend(r), 0);
      const aggResearch = d.reduce((s, r) => s + computeResearchSpend(r), 0);
      document.getElementById('totalTeachingSpend').textContent = fmt$(aggTeaching);
      document.getElementById('totalResearchSpend').textContent = fmt$(aggResearch);

      const perStudentVals = d.filter(r => r.uniqueStudents > 0).map(r => computeSpend(r) / r.uniqueStudents);
      document.getElementById('medianPerStudent').textContent = fmt$(median(perStudentVals));
      document.getElementById('meanPerStudent').textContent = fmt$(mean(perStudentVals));
    }

    function renderParamSummary() {
      var desc = perspectiveDescription(Math.round(perspectiveAlpha * 100));
      var text = 'Perspective: <strong>' + desc + '</strong> &middot; Teaching-focused: <strong>' + Math.round(teachingPct * 100) + '%</strong> &middot; Research-focused: <strong>' + Math.round(researchPct * 100) + '%</strong>';
      var el1 = document.getElementById('paramSummaryTable');
      var el2 = document.getElementById('paramSummaryScatter');
      if (el1) el1.innerHTML = text;
      if (el2) el2.innerHTML = text;
    }

    function render() {
      renderTable();
      renderChart();
      renderInsights();
      updateSummaryCards();
      renderParamSummary();
      renderExcluded();
    }

    // Populate scatter dropdowns
    function initScatterDropdowns() {
      const xSel = document.getElementById('scatterX');
      const ySel = document.getElementById('scatterY');
      for (const opt of AXIS_OPTIONS) {
        xSel.add(new Option(opt.label, opt.key));
        ySel.add(new Option(opt.label, opt.key));
      }
      xSel.value = currentXAxis;
      ySel.value = currentYAxis;

      xSel.addEventListener('change', e => { currentXAxis = e.target.value; renderChart(); });
      ySel.addEventListener('change', e => { currentYAxis = e.target.value; renderChart(); });
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

    // Bin toggle
    document.getElementById('binToggle').addEventListener('change', e => {
      binsEnabled = e.target.checked;
      renderTable();
    });

    // Perspective slider
    function perspectiveDescription(pct) {
      if (pct === 0) return 'Fully Divided';
      if (pct <= 25) return 'Mostly Divided';
      if (pct <= 45) return 'Leaning Divided';
      if (pct <= 55) return 'Balanced';
      if (pct <= 75) return 'Leaning Shared';
      if (pct < 100) return 'Mostly Shared';
      return 'Fully Shared';
    }
    document.getElementById('perspectiveSlider').addEventListener('input', e => {
      var pct = parseInt(e.target.value);
      perspectiveAlpha = pct / 100;
      document.getElementById('perspectiveVal').textContent = perspectiveDescription(pct);
      renderInsights();
      renderParamSummary();
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

    // Tab switching
    function switchTab() {
      var hash = location.hash || '#table';
      document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
      document.querySelectorAll('.tab-link').forEach(function(el) { el.classList.remove('active'); });
      var tabId = 'tab-' + hash.slice(1);
      var tab = document.getElementById(tabId);
      if (tab) {
        tab.classList.add('active');
      } else {
        document.getElementById('tab-table').classList.add('active');
        hash = '#table';
      }
      var link = document.querySelector('.tab-link[href="' + hash + '"]');
      if (link) {
        link.classList.add('active');
      } else {
        document.querySelector('.tab-link[href="#table"]').classList.add('active');
      }
      if (hash === '#scatter') renderChart();
    }
    window.addEventListener('hashchange', switchTab);

    initScatterDropdowns();
    switchTab();
    render();
  </script>
</body>
</html>`;

  writeFileSync(resolve(OUTPUT_DIR, "report.html"), html)
  console.log(`\n  Report written to output/report.html`)
  console.log(`  Results written to output/results.json`)
}
