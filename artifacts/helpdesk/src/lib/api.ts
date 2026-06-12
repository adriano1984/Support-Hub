const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("hd_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const API = {
  // Auth
  login: (name: string, password: string) =>
    apiFetch<{ token: string; user: { userId: number; name: string; role: string } }>("/api/auth/login", { method: "POST", body: JSON.stringify({ name, password }) }),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
  me: () => apiFetch<{ userId: number; name: string; role: string }>("/api/auth/me"),

  // Users
  listUsers: () => apiFetch<User[]>("/api/users"),
  createUser: (data: { name: string; role: string; password: string }) =>
    apiFetch<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<{ name: string; role: string; password: string; active: boolean }>) =>
    apiFetch<User>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: number, hard = false) =>
    apiFetch(`/api/users/${id}${hard ? "?hard=true" : ""}`, { method: "DELETE" }),

  // Tickets
  listTickets: (params?: {
    status?: string; branchId?: number; departmentId?: number; categoryId?: number;
    assignedTo?: number; search?: string; page?: number; limit?: number;
    unassigned?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.branchId) qs.set("branchId", String(params.branchId));
    if (params?.departmentId) qs.set("departmentId", String(params.departmentId));
    if (params?.categoryId) qs.set("categoryId", String(params.categoryId));
    if (params?.assignedTo) qs.set("assignedTo", String(params.assignedTo));
    if (params?.search) qs.set("search", params.search);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.unassigned) qs.set("unassigned", "true");
    return apiFetch<{ tickets: Ticket[]; total: number; page: number; limit: number }>(
      `/api/tickets${qs.toString() ? "?" + qs : ""}`
    );
  },
  assignTicket: (ticketId: number, userId: number | null) =>
    apiFetch(`/api/tickets/${ticketId}/assign`, { method: "POST", body: JSON.stringify({ userId }) }),
  getActivityLog: (ticketId: number) =>
    apiFetch<ActivityEntry[]>(`/api/tickets/${ticketId}/activity`),
  getAiSuggestion: (ticketId: number) =>
    apiFetch<{ suggestion: string }>(`/api/tickets/${ticketId}/ai-suggest`, { method: "POST" }),

  // Auth extra
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Dashboard
  stats: () => apiFetch<DashboardStats>("/api/dashboard/stats"),
  getDashboardRecent: () => apiFetch<RecentActivity[]>("/api/dashboard/recent"),
  recent: () => apiFetch("/api/dashboard/recent"),
  exportTickets: () => apiFetch<any[]>("/api/dashboard/export"),

  // Canned Responses
  listCannedResponses: (params?: { category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    return apiFetch<CannedResponse[]>(`/api/canned-responses${qs.toString() ? "?" + qs : ""}`);
  },
  listCannedCategories: () => apiFetch<string[]>("/api/canned-responses/categories"),
  createCannedResponse: (data: { category: string; title: string; content: string }) =>
    apiFetch<CannedResponse>("/api/canned-responses", { method: "POST", body: JSON.stringify(data) }),
  updateCannedResponse: (id: number, data: Partial<{ category: string; title: string; content: string; active: boolean }>) =>
    apiFetch<CannedResponse>(`/api/canned-responses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  duplicateCannedResponse: async (r: CannedResponse) =>
    apiFetch<CannedResponse>("/api/canned-responses", {
      method: "POST",
      body: JSON.stringify({ category: r.category, title: `Cópia de ${r.title}`, content: r.content }),
    }),
  deleteCannedResponse: (id: number) => apiFetch(`/api/canned-responses/${id}`, { method: "DELETE" }),

  // Roles
  listRoles: () => apiFetch<Role[]>("/api/roles"),
  createRole: (data: { name: string; label: string; permissions: Record<string, any> }) =>
    apiFetch<Role>("/api/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: number, data: { label: string; permissions: Record<string, any> }) =>
    apiFetch<Role>(`/api/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRole: (id: number) => apiFetch(`/api/roles/${id}`, { method: "DELETE" }),

  // Audit
  listAudit: (params?: { limit?: number; offset?: number; user?: string; action?: string; entity?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.user) qs.set("user", params.user);
    if (params?.action) qs.set("action", params.action);
    if (params?.entity) qs.set("entity", params.entity);
    return apiFetch<AuditResult>(`/api/audit${qs.toString() ? "?" + qs : ""}`);
  },

  // Settings
  listBranches: () => apiFetch<Array<{ id: number; name: string; active: boolean }>>("/api/settings/branches"),
  listDepartments: () => apiFetch<Array<{ id: number; name: string; active: boolean }>>("/api/settings/departments"),
  listCategories: () => apiFetch<Array<{ id: number; name: string; active: boolean }>>("/api/settings/categories"),

  // Audio
  sendAudioMessage: (ticketId: number, audioBase64: string) =>
    apiFetch<{ success: boolean; sent: boolean }>(`/api/tickets/${ticketId}/audio`, {
      method: "POST",
      body: JSON.stringify({ audioBase64 }),
    }),
};

export interface User {
  id: number;
  name: string;
  role: string;
  roleLabel: string;
  active: boolean;
  createdAt: string;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  whatsappPhone: string;
  clientName: string | null;
  branchId: number | null;
  branchName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  description: string;
  status: string;
  assignedTo: number | null;
  assigneeName: string | null;
  reopenCount: number;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface DashboardStats {
  totalOpen: number;
  totalInProgress: number;
  totalResolved: number;
  totalClosed: number;
  totalToday: number;
  totalAll: number;
  avgResolutionHours: number | null;
  avgFirstResponseHours: number | null;
  totalReopened: number;
  totalTransfers: number;
  byBranch: Array<{ label: string; count: number }>;
  byDepartment: Array<{ label: string; count: number }>;
  byCategory: Array<{ label: string; count: number }>;
  byClient: Array<{ label: string; count: number }>;
  byAssignee: Array<{ label: string; count: number }>;
  assigneeAvgResponse: Array<{ label: string; avgMinutes: number }>;
  last30days: Array<{ day: string; count: number }>;
  openByBranch: Array<{ label: string; count: number }>;
}

export interface RecentActivity {
  id: number;
  ticketId: number;
  ticketNumber: string;
  clientName: string | null;
  whatsappPhone: string;
  action: string;
  detail: string | null;
  status: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: number;
  ticketId: number;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface CannedResponse {
  id: number;
  category: string;
  title: string;
  content: string;
  active: boolean;
  createdAt: string;
}

export interface Role {
  id: number;
  name: string;
  label: string;
  permissions: Record<string, any>;
  isSystem: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entity: string | null;
  entityId: number | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditResult {
  total: number;
  rows: AuditEntry[];
}
