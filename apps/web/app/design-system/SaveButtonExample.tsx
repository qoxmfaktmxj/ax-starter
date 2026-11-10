import { useEffect, useState } from "react";
import { SaveButton } from "../../../../packages/ui/workspace/Workspace";

export function SaveButtonExample() {
  const [demo, setDemo] = useState<"ready" | "pending" | "done">("ready");
  useEffect(() => {
    if (demo !== "pending") return;
    const timer = window.setTimeout(() => setDemo("done"), 1200);
    return () => window.clearTimeout(timer);
  }, [demo]);

  return (
    <section
      className="workReading saveExample"
      aria-labelledby="save-example-title"
    >
      <h2 id="save-example-title">저장 버튼</h2>
      <p>기본 버튼을 눌러 예시 1건의 저장 과정을 확인하세요.</p>
      <dl>
        <div>
          <dt>기본</dt>
          <dd>저장할 변경이 있을 때</dd>
          <dd>
            <SaveButton
              count={1}
              pending={demo === "pending"}
              onClick={() => setDemo("pending")}
            />
          </dd>
        </div>
        <div>
          <dt>저장 중</dt>
          <dd>저장 응답을 기다릴 때</dd>
          <dd>
            <SaveButton count={1} pending />
          </dd>
        </div>
        <div>
          <dt>비활성</dt>
          <dd>저장할 변경이 없을 때</dd>
          <dd>
            <SaveButton count={0} disabled />
          </dd>
        </div>
      </dl>
      <p role="status">{demo === "done" && "예시 1건을 저장했습니다."}</p>
    </section>
  );
}
