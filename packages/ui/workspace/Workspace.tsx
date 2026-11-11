import {
  Children,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
} from "react";
import { WorkspaceIcon, type WorkspaceIconName } from "./WorkspaceIcon";
import { AppearanceSettings } from "./AppearanceSettings";
import { BRAND_NAME } from "../../core/brand";
import "./workspace.css";

export type MenuLayout = "side" | "top";
type MenuItem = {
  label: string;
  icon: WorkspaceIconName;
  active?: boolean;
  onSelect: () => void;
};

export function WorkspaceShell({
  layout = "side",
  menu,
  homeCurrent = false,
  onHome,
  scopeLabel,
  search,
  onSignOut,
  children,
}: {
  layout?: MenuLayout;
  menu: MenuItem[];
  homeCurrent?: boolean;
  onHome?: () => void;
  scopeLabel: string;
  search?: ReactNode;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const inlineUtility = layout === "top" && !search;
  const utility = (
    <>
      {" "}
      <small className="workspaceEnvironment">가상 데이터 전용 로컬 환경</small>
      <div className="workspaceProfile">
        <WorkspaceIcon name="user" />
        <span>
          <small>조회 범위</small>
          <strong>{scopeLabel}</strong>
        </span>
      </div>
    </>
  );
  return (
    <main className="workspaceShell" data-menu={layout}>
      <aside className="workspaceRail" aria-label="업무 메뉴">
        <a
          className="workspaceBrand"
          href="/"
          aria-label="홈"
          aria-current={homeCurrent ? "page" : undefined}
          title={`${BRAND_NAME} 홈`}
          onClick={(event) => {
            if (
              onHome &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              onHome();
            }
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path d="m2 20 8-16h5L7 20zM12 16l3-6 7 10h-7z" />
          </svg>
          <span>{BRAND_NAME}</span>
        </a>
        <nav aria-label="주 메뉴">
          {menu.map((item) => (
            <button
              type="button"
              key={item.label}
              className={item.active ? "active" : undefined}
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={item.onSelect}
            >
              <WorkspaceIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <AppearanceSettings />
        </nav>
        {inlineUtility && utility}
        <button
          type="button"
          className="workspaceSignOut"
          aria-label="로그아웃"
          title="로그아웃"
          onClick={onSignOut}
        >
          <WorkspaceIcon name="exit" />
        </button>
      </aside>
      {!inlineUtility && (
        <header className="workspaceTopbar">
          {search}
          {utility}
        </header>
      )}
      {children}
    </main>
  );
}

export function ActionButton({
  pending = false,
  pendingLabel,
  children,
  disabled,
  primary = false,
  size = "regular",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: string;
  primary?: boolean;
  size?: "compact" | "regular" | "large";
}) {
  return (
    <button
      {...props}
      type={type}
      data-size={size}
      data-action={primary ? "primary" : "secondary"}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && <span className="workSpinner" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function SaveButton({
  count,
  pending,
  ...props
}: Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "onClick" | "onPointerDown"
> & {
  count: number;
  pending?: boolean;
}) {
  return (
    <ActionButton
      {...props}
      className="workSaveButton"
      primary
      pending={pending}
      pendingLabel="저장 중"
    >
      저장 {count}건
    </ActionButton>
  );
}

export function SearchPanel({
  children,
  pending = false,
  disabled,
  onSubmit,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <form
      {...props}
      className="workspaceFilters"
      aria-busy={pending}
      onSubmit={(event) => {
        if (disabled || pending) {
          event.preventDefault();
          return;
        }
        onSubmit?.(event);
      }}
    >
      {children}
      <ActionButton
        type="submit"
        pending={pending}
        pendingLabel="조회 중"
        disabled={disabled}
      >
        조회
      </ActionButton>
    </form>
  );
}

export function GridLayout({ children }: { children: ReactNode }) {
  const panels = Children.toArray(children);
  return (
    <div className="workGridLayout" data-count={panels.length}>
      {panels}
    </div>
  );
}

export function GridPanel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="workspaceTablePanel" aria-label={title}>
      {title && <h2 className="workPanelTitle">{title}</h2>}
      {children}
    </section>
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const description = error || hint;
  return (
    <div className="workField">
      <label htmlFor={inputId}>
        {label}
        <input
          {...props}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            description ? inputId + "-help" : props["aria-describedby"]
          }
        />
      </label>
      {description && (
        <small id={inputId + "-help"} role={error ? "alert" : undefined}>
          {description}
        </small>
      )}
    </div>
  );
}
