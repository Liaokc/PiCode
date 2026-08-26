interface DirectoryPickerProps {
  starting: boolean;
  error: string | null;
  onPick: () => void;
}

export function DirectoryPicker({
  starting,
  error,
  onPick,
}: DirectoryPickerProps): JSX.Element {
  return (
    <div className="picker">
      <h1>PiCode</h1>
      <p>选择要作为会话作用域的工作目录,然后与 Pi 对话。</p>
      <button className="primary" onClick={onPick} disabled={starting}>
        {starting ? "正在启动…" : "选择工作目录"}
      </button>
      {error && <div className="error">启动失败:{error}</div>}
    </div>
  );
}
