import { expect, test } from "vitest";
import { buildIndex } from "./lib/hiringIndex";

const NOW = Date.UTC(2026, 10, 16);
const role = (company: string, title: string, family: string, cities: string[], daysOld: number, salary?: string) => ({
  externalId: `${company}:${title}:${cities.join()}`, company, title, location: cities.join(", "), url: `https://x/${company}`, at: NOW - daysOld * 86_400_000, family, cities, key: `${company}|${title}`, salary,
});

test("counts roles by type and city, companies by different roles, and keeps reposts and pay", () => {
  const roles = [
    role("Acme", "SDR", "SDR / BDR", ["Bengaluru"], 1),
    role("Acme", "SDR", "SDR / BDR", ["Mumbai"], 1),
    role("Acme", "Account Executive", "Account Executive", ["Bengaluru"], 10, "₹20L"),
    role("Beta", "Account Executive", "Account Executive", ["Remote"], 2),
  ];
  const x = buildIndex(roles, new Map([["Acme|Account Executive", 2]]), ["SDR / BDR", "Account Executive", "Sales Leadership"], ["Bengaluru", "Mumbai", "Remote"], NOW);
  expect(x.totals).toEqual({ open: 4, newWeek: 3, companies: 2, withSalary: 1 });
  expect(x.families.map((f) => f.name)).toEqual(["SDR / BDR", "Account Executive"]);
  expect(x.cities.find((c) => c.city === "Bengaluru")).toEqual({ city: "Bengaluru", open: 2, newWeek: 1 });
  // The same SDR role in two cities is one role.
  expect(x.topCompanies[0]).toEqual({ company: "Acme", open: 2 });
  expect(x.bengaluru[0].companies).toEqual([{ company: "Acme", open: 1 }]);
  expect(x.reposted).toEqual([{ company: "Acme", title: "Account Executive", reposts: 2 }]);
  expect(x.salaries[0].salary).toBe("₹20L");
});
