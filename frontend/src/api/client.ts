const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  formData?: FormData;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, formData, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  requestHeaders.set("Accept", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: requestHeaders,
    body: payload,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorBody = data as
      | { code?: string; message?: string; details?: unknown }
      | null;
    throw new ApiError(
      response.status,
      errorBody?.code ?? "HTTP_ERROR",
      errorBody?.message ?? `请求失败（HTTP ${response.status}）`,
      errorBody?.details,
    );
  }

  return data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};

export function withQuery(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function uploadVideo(
  file: File,
  tenantId: string | undefined,
  onProgress: (percent: number) => void,
): Promise<import("./types").Video> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    if (tenantId) {
      formData.append("tenant_id", tenantId);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/admin/videos`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as import("./types").Video);
      } else {
        const errorBody = data as
          | { code?: string; message?: string; details?: unknown }
          | null;
        reject(
          new ApiError(
            xhr.status,
            errorBody?.code ?? "UPLOAD_FAILED",
            errorBody?.message ?? "上传失败",
            errorBody?.details,
          ),
        );
      }
    };

    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "网络错误"));
    xhr.send(formData);
  });
}
