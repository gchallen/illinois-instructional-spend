import { writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve } from "path"
import type { DepartmentAnalysis, Scenario } from "./analysis"

const OUTPUT_DIR = resolve(import.meta.dir, "../output")

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(0) + "%"
}

export function generateReport(results: DepartmentAnalysis[]) {
  ensureOutputDir()

  // Save raw JSON
  writeFileSync(resolve(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2))

  // Sort by realistic per-student spend descending
  const sorted = [...results].filter((r) => r.uniqueStudents > 0).sort((a, b) => b.perStudent.realistic - a.perStudent.realistic)

  const labels = sorted.map((r) => r.cisSubject)
  const realisticData = sorted.map((r) => Math.round(r.perStudent.realistic))
  const generousData = sorted.map((r) => Math.round(r.perStudent.generous))
  const unlikelyData = sorted.map((r) => Math.round(r.perStudent.unlikely))

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UIUC Instructional Salary Spend Per Student — Spring 2026</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; }
    h1 { text-align: center; margin-bottom: 8px; font-size: 1.5rem; }
    .subtitle { text-align: center; color: #666; margin-bottom: 24px; font-size: 0.9rem; }
    .chart-container { background: white; border-radius: 8px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto; }
    .chart-inner { min-width: ${Math.max(800, sorted.length * 50)}px; height: 500px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 0.8rem; }
    th { background: #2563eb; color: white; padding: 8px 6px; text-align: left; white-space: nowrap; position: sticky; top: 0; }
    td { padding: 6px; border-bottom: 1px solid #eee; white-space: nowrap; }
    tr:hover td { background: #f0f4ff; }
    .right { text-align: right; }
    .note { margin-top: 16px; font-size: 0.8rem; color: #888; text-align: center; }
    .legend-note { text-align: center; font-size: 0.85rem; color: #555; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>UIUC Instructional Salary Spend Per Student</h1>
  <div class="subtitle">Spring 2026 — Grey Book Salaries × CIS Course Data × LDAP Enrollment</div>
  <div class="legend-note">
    Scenarios: <strong>Realistic</strong> (tenure-track 20%) · <strong>Generous</strong> (tenure-track 30%) · <strong>Unlikely</strong> (tenure-track 40%) — Teaching faculty always 70%, Clinical 50%
  </div>

  <div class="chart-container">
    <div class="chart-inner">
      <canvas id="spendChart"></canvas>
    </div>
  </div>

  <h2 style="margin: 16px 0 8px;">Department Summary</h2>
  <div style="overflow-x: auto;">
  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th>Department</th>
        <th class="right">Faculty</th>
        <th class="right">Matched</th>
        <th class="right">Match %</th>
        <th class="right">Teaching</th>
        <th class="right">Tenure</th>
        <th class="right">Research</th>
        <th class="right">Clinical</th>
        <th class="right">Total Salary</th>
        <th class="right">Matched Salary</th>
        <th class="right">Students</th>
        <th class="right">Courses</th>
        <th class="right">Spend/Student (R)</th>
        <th class="right">Spend/Student (G)</th>
        <th class="right">Spend/Student (U)</th>
      </tr>
    </thead>
    <tbody>
${sorted
  .map(
    (r) => `      <tr>
        <td><strong>${r.cisSubject}</strong></td>
        <td>${r.cisName}</td>
        <td class="right">${r.totalFaculty}</td>
        <td class="right">${r.matchedFaculty}</td>
        <td class="right">${formatPercent(r.matchRate)}</td>
        <td class="right">${r.teachingCount}</td>
        <td class="right">${r.tenureTrackCount}</td>
        <td class="right">${r.researchCount}</td>
        <td class="right">${r.clinicalCount}</td>
        <td class="right">${formatCurrency(r.totalProposedSalary)}</td>
        <td class="right">${formatCurrency(r.matchedProposedSalary)}</td>
        <td class="right">${r.uniqueStudents.toLocaleString()}</td>
        <td class="right">${r.courseCount}</td>
        <td class="right">${formatCurrency(r.perStudent.realistic)}</td>
        <td class="right">${formatCurrency(r.perStudent.generous)}</td>
        <td class="right">${formatCurrency(r.perStudent.unlikely)}</td>
      </tr>`,
  )
  .join("\n")}
    </tbody>
  </table>
  </div>

  <div class="note">
    Faculty types: Teaching = lecturers/instructors (70% → instruction), Tenure-track = professors (20/30/40%), Research = research professors (same as tenure-track), Clinical (50%).<br>
    Only Grey Book faculty matched to CIS instructors are counted. Unmatched CIS instructors (TAs, adjuncts) excluded.<br>
    Generated ${new Date().toISOString().slice(0, 10)}.
  </div>

  <script>
    const ctx = document.getElementById('spendChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [
          {
            label: 'Realistic (TT 20%)',
            data: ${JSON.stringify(realisticData)},
            backgroundColor: 'rgba(37, 99, 235, 0.8)',
          },
          {
            label: 'Generous (TT 30%)',
            data: ${JSON.stringify(generousData)},
            backgroundColor: 'rgba(245, 158, 11, 0.8)',
          },
          {
            label: 'Unlikely (TT 40%)',
            data: ${JSON.stringify(unlikelyData)},
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Instructional Salary Spend Per Student by Department',
            font: { size: 16 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString(),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => '$' + v.toLocaleString(),
            },
            title: {
              display: true,
              text: 'Spend Per Student ($)',
            },
          },
          x: {
            ticks: {
              maxRotation: 90,
              minRotation: 45,
            },
          },
        },
      },
    });
  </script>
</body>
</html>`

  writeFileSync(resolve(OUTPUT_DIR, "report.html"), html)
  console.log(`\n  Report written to output/report.html`)
  console.log(`  Results written to output/results.json`)
}
