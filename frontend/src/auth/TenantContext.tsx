import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "../api/client";
import type { Tenant } from "../api/types";
import { useAuth } from "./AuthContext";

interface TenantContextValue {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  selectedTenantId: string | undefined;
  setSelectedTenantId: (id: string) => void;
  isPlatformAdmin: boolean;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "PLATFORM_ADMIN";
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantIdState] = useState<
    string | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setSelectedTenantIdState(undefined);
      return;
    }
    if (user.role === "PLATFORM_ADMIN") {
      setLoading(true);
      api
        .get<Tenant[]>("/admin/tenants")
        .then((items) => {
          setTenants(items);
          const stored = localStorage.getItem("selected_tenant_id");
          const preferred =
            items.find((item) => item.id === stored) ?? items[0] ?? null;
          setSelectedTenantIdState(preferred?.id);
        })
        .finally(() => setLoading(false));
    } else {
      setTenants(user.tenant ? [user.tenant] : []);
      setSelectedTenantIdState(user.tenant?.id);
    }
  }, [user]);

  const setSelectedTenantId = (id: string) => {
    setSelectedTenantIdState(id);
    localStorage.setItem("selected_tenant_id", id);
  };

  const selectedTenant = useMemo(
    () => tenants.find((item) => item.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  );

  return (
    <TenantContext.Provider
      value={{
        tenants,
        selectedTenant,
        selectedTenantId,
        setSelectedTenantId,
        isPlatformAdmin,
        loading,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used inside TenantProvider");
  }
  return context;
}
