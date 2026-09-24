import { db, pool } from "../packages/server/db";
import {
  appUsers,
  employees,
  organizations,
} from "../packages/server/db/schema";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const issuer =
  process.env.OIDC_ISSUER ?? "http://host.docker.internal:8090/default";

try {
  await db
    .insert(organizations)
    .values([
      { id: orgA, code: "A", name: "가상조직A" },
      { id: orgB, code: "B", name: "가상조직B 매우 긴 조직명 검증 부서" },
    ])
    .onConflictDoNothing();

  await db
    .insert(appUsers)
    .values([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        issuer,
        subject: "hr-admin",
        orgId: orgA,
        roleCode: "HR_ADMIN",
        dataScope: "ALL",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        issuer,
        subject: "org-manager",
        orgId: orgA,
        roleCode: "ORG_MANAGER",
        dataScope: "ORG",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        issuer,
        subject: "inactive-user",
        orgId: orgA,
        active: 0,
        roleCode: "ORG_MANAGER",
        dataScope: "ORG",
      },
    ])
    .onConflictDoNothing();

  const rows = Array.from({ length: 24 }, (_, index) => {
    const number = index + 1;
    return {
      id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
      employeeNo: `E${String(number).padStart(3, "0")}`,
      name:
        number === 2 || number === 14
          ? "김가람"
          : `가상사원${String(number).padStart(2, "0")}`,
      orgId: number <= 12 ? orgA : orgB,
      position: number % 3 === 0 ? "선임" : "사원",
      hireDate:
        number === 1
          ? "2024-01-31"
          : `2024-${String((number % 12) + 1).padStart(2, "0")}-15`,
      status: number % 9 === 0 ? "LEAVE" : "ACTIVE",
      email: number === 4 ? "" : `employee${number}@example.invalid`,
      monthlySalary:
        number === 1 ? "9999999999999999.99" : `${3000000 + number * 10000}.00`,
    };
  });
  await db.insert(employees).values(rows).onConflictDoNothing();
  console.log("Synthetic seed complete");
} finally {
  await pool.end();
}
