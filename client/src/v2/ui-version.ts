export type UiVersion = "v1" | "v2";

export function getUiVersion(): UiVersion {
  if (typeof window === "undefined") return "v1";

  const url = new URL(window.location.href);
  const fromQuery = (url.searchParams.get("ui") || "").toLowerCase();
  const fromStorage = (localStorage.getItem("simfi_ui") || "").toLowerCase();
  const v = fromQuery || fromStorage;

  return v === "v2" ? "v2" : "v1";
}

export function setUiVersion(v: UiVersion) {
  if (typeof window === "undefined") return;
  localStorage.setItem("simfi_ui", v);
}
