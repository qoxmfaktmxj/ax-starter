import { BRAND_NAME } from "@/packages/core/brand";
import { loadWorkspaceHome } from "./home/loadWorkspaceHome";
import WorkspaceHome from "./home/WorkspaceHome";

export const metadata = { title: `${BRAND_NAME} 홈` };

export default async function Home() {
  const home = await loadWorkspaceHome();
  if (!home) {
    return (
      <main className="workspaceAuth">
        <p role="alert">업무 계정에 접근할 수 없습니다.</p>
        <a href="/login">로그인으로 이동</a>
      </main>
    );
  }
  return <WorkspaceHome {...home} />;
}
