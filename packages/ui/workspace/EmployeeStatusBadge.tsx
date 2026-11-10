export function employeeStatusLabel(value: unknown): string {
  if (value === "ACTIVE") return "재직";
  if (value === "LEAVE") return "휴직";
  return String(value ?? "");
}

export function EmployeeStatusBadge({ status }: { status: string }) {
  return (
    <span className="gridStatus" data-status={status}>
      {employeeStatusLabel(status)}
    </span>
  );
}
