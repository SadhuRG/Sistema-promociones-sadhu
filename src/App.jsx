import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const PROMOTION_SELECT = `
  id,
  titulo,
  detalle,
  fecha_inicio,
  fecha_fin,
  imagen_url,
  activa,
  created_at,
  promociones_especialidades(
    especialidad_id,
    especialidades(id, nombre)
  )
`;

const DOCTOR_SELECT = `
  id,
  nombre,
  especialidad_id,
  activo,
  created_at,
  especialidades(nombre)
`;

const SCHEDULE_SELECT = `
  id,
  mes,
  imagen_url,
  doctor_id,
  created_at,
  doctores(nombre)
`;

const REPORT_SELECT = "id, nombre, descripcion, imagen_url, created_at";
const USER_SELECT = "id, username, rol, activo, created_at";
const ADMIN_ROLE = "Admin";
const USER_ROLE = "User";
const MARKETING_ROLE = "Marketing";

const getDaysRemaining = (dateValue) => {
  if (!dateValue) return null;
  const endDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDate - today) / 86400000));
};

const isPromotionExpired = (dateValue) => {
  if (!dateValue) return false;
  const endDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today;
};

const normalizePromotion = (promo) => {
  const vencida = isPromotionExpired(promo.fecha_fin);
  const specialties = (promo.promociones_especialidades || [])
    .map((item) => item.especialidades)
    .filter(Boolean);
  const specialtyNames = specialties.map((specialty) => specialty.nombre);

  return {
    ...promo,
    vencida,
    isActive: Boolean(promo.activa && !vencida),
    especialidades: specialties,
    especialidad_ids: (promo.promociones_especialidades || [])
      .map((item) => item.especialidad_id)
      .filter(Boolean),
    especialidad: specialtyNames.length > 0 ? specialtyNames.join(" ") : "Sin especialidad",
    flyer: promo.imagen_url || "",
    dias_restantes: getDaysRemaining(promo.fecha_fin),
  };
};

const normalizeDoctor = (doctor) => ({
  ...doctor,
  especialidad: doctor.especialidades?.nombre || "Sin especialidad",
});

const normalizeSchedule = (schedule) => ({
  ...schedule,
  doctor: schedule.doctores?.nombre || "Sin doctor",
});

const getPromotionStatus = (promo) => (promo.isActive ? "activo" : "inactivo");

const makeStoragePath = (folder, file) => {
  const extension = file.name.split(".").pop() || "jpg";
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${folder}/${uniqueId}.${extension}`;
};

const formatAuthError = (error) => {
  if (!error) return "No se pudo iniciar sesión.";
  const message = error.message || "";

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }

  return `No se pudo iniciar sesión: ${message}`;
};

const iconMap = {
  "badge-check": "✓",
  "badge-percent": "%",
  "layout-dashboard": "▦",
  "log-out": "↗",
  "monitor-play": "▣",
  "plus-circle": "+",
  pencil: "✎",
  search: "⌕",
  "shield-check": "✓",
  user: "●",
  expand: "⛶",
  menu: "☰",
  close: "×",
};

function Icon({ name, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      {iconMap[name] || "•"}
    </span>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [view, setView] = useState("catalogo");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedPromo, setSelectedPromo] = useState(null);
  const [modalIndex, setModalIndex] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [dataError, setDataError] = useState("");
  const [noticeModal, setNoticeModal] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = adminUser?.rol === ADMIN_ROLE;
  const isUser = adminUser?.rol === USER_ROLE;
  const isMarketing = adminUser?.rol === MARKETING_ROLE;
  const canViewPrivateContent = isLoggedIn && (isAdmin || isUser);
  const canAccessPromotionDashboard = isLoggedIn && (isAdmin || isMarketing);
  const activePromotions = promotions.filter((promo) => promo.isActive);
  const modalPromotions = view === "catalogo" ? activePromotions : promotions;

  const loadPromotions = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setPromotions([]);
      setDataError("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para conectar Supabase.");
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    const { data, error } = await supabase
      .from("promociones")
      .select(PROMOTION_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      setDataError(`No se pudieron cargar las promociones: ${error.message}`);
      setPromotions([]);
    } else {
      setDataError("");
      setPromotions((data || []).map(normalizePromotion));
    }

    setIsLoadingData(false);
  }, []);

  const loadSpecialties = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSpecialties([]);
      return;
    }

    const { data, error } = await supabase
      .from("especialidades")
      .select("id, codigo, nombre")
      .order("nombre", { ascending: true });

    if (error) {
      setDataError(`No se pudieron cargar las especialidades: ${error.message}`);
      setSpecialties([]);
      return;
    }

    setSpecialties(data || []);
  }, []);

  const loadDoctors = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDoctors([]);
      return;
    }

    const { data, error } = await supabase
      .from("doctores")
      .select(DOCTOR_SELECT)
      .order("nombre", { ascending: true });

    if (error) {
      setDataError(`No se pudieron cargar los doctores: ${error.message}`);
      setDoctors([]);
      return;
    }

    setDoctors((data || []).map(normalizeDoctor));
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSchedules([]);
      return;
    }

    const { data, error } = await supabase
      .from("horarios")
      .select(SCHEDULE_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      setDataError(`No se pudieron cargar los horarios: ${error.message}`);
      setSchedules([]);
      return;
    }

    setSchedules((data || []).map(normalizeSchedule));
  }, []);

  const loadReports = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setReports([]);
      return;
    }

    const { data, error } = await supabase
      .from("informes")
      .select(REPORT_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      setDataError(`No se pudieron cargar los informes: ${error.message}`);
      setReports([]);
      return;
    }

    setReports(data || []);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setUsers([]);
      return;
    }

    const { data, error } = await supabase
      .from("usuarios")
      .select(USER_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      setDataError(`No se pudieron cargar los usuarios: ${error.message}`);
      setUsers([]);
      return;
    }

    setUsers(data || []);
  }, []);

  useEffect(() => {
    loadPromotions();
    loadSpecialties();
  }, [loadPromotions, loadSpecialties]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPromotions((current) => current.map(normalizePromotion));
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canAccessPromotionDashboard || !isSupabaseConfigured) return undefined;

    const expiredActiveIds = promotions
      .filter((promo) => promo.activa && promo.vencida)
      .map((promo) => promo.id);

    if (expiredActiveIds.length === 0) return undefined;

    let isCancelled = false;

    supabase
      .from("promociones")
      .update({ activa: false })
      .in("id", expiredActiveIds)
      .then(({ error }) => {
        if (error || isCancelled) return;

        setPromotions((current) =>
          current.map((promo) =>
            expiredActiveIds.includes(promo.id)
              ? normalizePromotion({ ...promo, activa: false })
              : promo
          )
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [canAccessPromotionDashboard, promotions]);

  useEffect(() => {
    if (!canViewPrivateContent) return;

    loadDoctors();
    loadSchedules();
    loadReports();

    if (isAdmin) {
      loadUsers();
    }
  }, [canViewPrivateContent, isAdmin, loadDoctors, loadReports, loadSchedules, loadUsers]);

  const getUserProfile = useCallback(async (email) => {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, username, rol, activo")
      .eq("username", email)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo validar el perfil del usuario: ${error.message}`);
    }

    if (!data || !data.activo || ![ADMIN_ROLE, USER_ROLE, MARKETING_ROLE].includes(data.rol)) {
      throw new Error("Acceso denegado: No tienes permisos para ingresar");
    }

    return data;
  }, []);

  const applySession = useCallback(
    async (session) => {
      if (!session?.user?.email) {
        setIsLoggedIn(false);
        setAdminUser(null);
        return;
      }

      try {
        const profile = await getUserProfile(session.user.email);
        setAdminUser(profile);
        setIsLoggedIn(true);
        setView((currentView) => {
          if (currentView !== "login") return currentView;
          return profile.rol === USER_ROLE ? "horarios" : "dashboard";
        });
      } catch {
        await supabase.auth.signOut();
        setIsLoggedIn(false);
        setAdminUser(null);
        setView("catalogo");
      }
    },
    [getUserProfile]
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsCheckingSession(false);
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!isMounted) return;

      if (error) {
        setDataError(`No se pudo recuperar la sesión: ${error.message}`);
      } else {
        await applySession(data.session);
      }

      if (isMounted) {
        setIsCheckingSession(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        applySession(session);
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const openModal = (promo) => {
    const index = modalPromotions.findIndex((item) => item.id === promo.id);
    setModalIndex(index >= 0 ? index : 0);
  };

  const closeModal = useCallback(() => setModalIndex(null), []);

  const loginAdmin = async ({ username, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error("Configura las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
    }

    const email = username.trim().toLowerCase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      throw new Error(formatAuthError(authError));
    }

    try {
      const profile = await getUserProfile(email);
      setAdminUser(profile);
      setIsLoggedIn(true);
      setView(profile.rol === USER_ROLE ? "horarios" : "dashboard");
    } catch (profileError) {
      if (authData.session) {
        await supabase.auth.signOut();
      }
      throw profileError;
    }
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setIsLoggedIn(false);
    setAdminUser(null);
    setView("catalogo");
    setSidebarOpen(false);
  };

  const navigate = (nextView) => {
    if (nextView === "nueva") {
      setSelectedPromo(null);
    }
    setView(nextView);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (isLoggedIn && view === "login") {
      setView(isAdmin ? "dashboard" : "horarios");
    }
  }, [isAdmin, isLoggedIn, view]);

  const uploadImage = async (file, folder = "promociones") => {
    const filePath = makeStoragePath(folder, file);
    const { error } = await supabase.storage.from("flyers").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      throw new Error(`No se pudo subir la imagen: ${error.message}`);
    }

    const { data } = supabase.storage.from("flyers").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const togglePromo = async (id) => {
    if (!isSupabaseConfigured) return;
    const target = promotions.find((promo) => promo.id === id);
    if (!target) return;

    const nextActive = !target.isActive;

    if (nextActive && target.vencida) {
      setNoticeModal({
        title: "Promoción vencida",
        message: "Cambie la fecha límite para que la promoción se active.",
      });
      return;
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from("promociones")
      .update({ activa: nextActive })
      .eq("id", id)
      .select(PROMOTION_SELECT)
      .single();

    if (error) {
      setDataError(`No se pudo actualizar el estado: ${error.message}`);
    } else {
      setDataError("");
      const updatedPromo = normalizePromotion(data);
      setPromotions((current) =>
        current.map((promo) => (promo.id === id ? updatedPromo : promo))
      );
    }

    setIsSaving(false);
  };

  const savePromotionSpecialties = async (promotionId, specialtyIds = []) => {
    const { error: deleteError } = await supabase
      .from("promociones_especialidades")
      .delete()
      .eq("promocion_id", promotionId);

    if (deleteError) {
      throw new Error(`No se pudieron actualizar las especialidades: ${deleteError.message}`);
    }

    if (!specialtyIds.length) return;

    const rows = specialtyIds.map((specialtyId) => ({
      promocion_id: promotionId,
      especialidad_id: specialtyId,
    }));

    const { error: insertError } = await supabase
      .from("promociones_especialidades")
      .insert(rows);

    if (insertError) {
      throw new Error(`No se pudieron guardar las especialidades: ${insertError.message}`);
    }
  };

  const getPromotionById = async (promotionId) => {
    const { data, error } = await supabase
      .from("promociones")
      .select(PROMOTION_SELECT)
      .eq("id", promotionId)
      .single();

    if (error) {
      throw new Error(`No se pudo recargar la promoción: ${error.message}`);
    }

    return normalizePromotion(data);
  };

  const savePromotion = async (formData, editingId) => {
    if (!isSupabaseConfigured) {
      throw new Error("Configura las variables de Supabase antes de guardar promociones.");
    }

    setIsSaving(true);
    try {
      const file = formData.flyer?.[0];
      let imageUrl = formData.imagen_url || "";

      if (file) {
        imageUrl = await uploadImage(file, "promociones");
      }

      const payload = {
        titulo: formData.titulo,
        detalle: formData.detalle,
        fecha_inicio: formData.fecha_inicio,
        fecha_fin: formData.fecha_fin,
        activa: !isPromotionExpired(formData.fecha_fin) ? true : formData.activa,
      };

      if (imageUrl) {
        payload.imagen_url = imageUrl;
      }

      const query = editingId
        ? supabase
            .from("promociones")
            .update(payload)
            .eq("id", editingId)
            .select(PROMOTION_SELECT)
            .single()
        : supabase
            .from("promociones")
            .insert(payload)
            .select(PROMOTION_SELECT)
            .single();

      const { data, error } = await query;

      if (error) {
        throw new Error(`No se pudo guardar la promoción: ${error.message}`);
      }

      await savePromotionSpecialties(data.id, formData.especialidad_ids);
      const savedPromo = await getPromotionById(data.id);
      setDataError("");
      setPromotions((current) =>
        editingId
          ? current.map((promo) => (promo.id === editingId ? savedPromo : promo))
          : [savedPromo, ...current]
      );
    } finally {
      setIsSaving(false);
    }

    navigate("dashboard");
  };

  const saveSpecialty = async (formData, editingId) => {
    setIsSaving(true);
    try {
      const payload = {
        codigo: formData.codigo,
        nombre: formData.nombre,
      };
      const query = editingId
        ? supabase.from("especialidades").update(payload).eq("id", editingId).select("id, codigo, nombre").single()
        : supabase.from("especialidades").insert(payload).select("id, codigo, nombre").single();
      const { data, error } = await query;

      if (error) throw new Error(`No se pudo guardar la especialidad: ${error.message}`);

      setSpecialties((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? data : item))
          : [...current, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setDataError("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveDoctor = async (formData, editingId) => {
    setIsSaving(true);
    try {
      const payload = {
        nombre: formData.nombre,
        especialidad_id: formData.especialidad_id,
        activo: formData.activo,
      };
      const query = editingId
        ? supabase.from("doctores").update(payload).eq("id", editingId).select(DOCTOR_SELECT).single()
        : supabase.from("doctores").insert(payload).select(DOCTOR_SELECT).single();
      const { data, error } = await query;

      if (error) throw new Error(`No se pudo guardar el doctor: ${error.message}`);

      const savedDoctor = normalizeDoctor(data);
      setDoctors((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? savedDoctor : item))
          : [...current, savedDoctor].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setDataError("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveSchedule = async (formData, editingId) => {
    setIsSaving(true);
    try {
      const file = formData.imagen?.[0];
      let imageUrl = formData.imagen_url || "";

      if (file) {
        imageUrl = await uploadImage(file, "horarios");
      }

      const payload = {
        mes: formData.mes,
        doctor_id: formData.doctor_id,
      };

      if (imageUrl) payload.imagen_url = imageUrl;

      const query = editingId
        ? supabase.from("horarios").update(payload).eq("id", editingId).select(SCHEDULE_SELECT).single()
        : supabase.from("horarios").insert(payload).select(SCHEDULE_SELECT).single();
      const { data, error } = await query;

      if (error) throw new Error(`No se pudo guardar el horario: ${error.message}`);

      const savedSchedule = normalizeSchedule(data);
      setSchedules((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? savedSchedule : item))
          : [savedSchedule, ...current]
      );
      setDataError("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveReport = async (formData, editingId) => {
    setIsSaving(true);
    try {
      const file = formData.imagen?.[0];
      let imageUrl = formData.imagen_url || "";

      if (file) {
        imageUrl = await uploadImage(file, "informes");
      }

      const payload = {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
      };

      if (imageUrl) payload.imagen_url = imageUrl;

      const query = editingId
        ? supabase.from("informes").update(payload).eq("id", editingId).select(REPORT_SELECT).single()
        : supabase.from("informes").insert(payload).select(REPORT_SELECT).single();
      const { data, error } = await query;

      if (error) throw new Error(`No se pudo guardar el informe: ${error.message}`);

      setReports((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? data : item))
          : [data, ...current]
      );
      setDataError("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveUser = async (formData, editingId) => {
    setIsSaving(true);
    try {
      const payload = {
        username: formData.username.trim().toLowerCase(),
        rol: formData.rol,
        activo: formData.activo,
      };
      const query = editingId
        ? supabase.from("usuarios").update(payload).eq("id", editingId).select(USER_SELECT).single()
        : supabase.from("usuarios").insert(payload).select(USER_SELECT).single();
      const { data, error } = await query;

      if (error) throw new Error(`No se pudo guardar el usuario: ${error.message}`);

      setUsers((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? data : item))
          : [data, ...current]
      );
      setDataError("");
    } finally {
      setIsSaving(false);
    }
  };

  const renderPromotionDashboard = () => (
    <>
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view="dashboard"
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <Dashboard
          promotions={promotions}
          isLoading={isLoadingData}
          error={dataError}
          isSaving={isSaving}
          panelTitle={isMarketing ? "Marketing" : "Panel Administrador"}
          canEditPromotions={isAdmin || isMarketing}
          canTogglePromotions={isAdmin || isMarketing}
          onOpenModal={openModal}
          onToggle={togglePromo}
          onEdit={(promo) => {
            if (!isAdmin && !isMarketing) return;
            setSelectedPromo(promo);
            navigate("editar");
          }}
        />
      </AdminLayout>
      <ImageModal
        promotions={promotions}
        modalIndex={modalIndex}
        setModalIndex={setModalIndex}
        onClose={closeModal}
      />
      <NoticeModal notice={noticeModal} onClose={() => setNoticeModal(null)} />
    </>
  );

  if (isCheckingSession) {
    return <FullScreenStatus message="Verificando sesión..." />;
  }

  if (view === "login" && !isLoggedIn) {
    return <LoginScreen onLogin={loginAdmin} onCatalog={() => navigate("catalogo")} />;
  }

  if (view === "login" && isLoggedIn) {
    return <FullScreenStatus message="Redirigiendo..." />;
  }

  if (view === "catalogo") {
    return (
      <>
        <CatalogScreen
          isLoggedIn={isLoggedIn}
          userProfile={adminUser}
          isMarketing={isMarketing}
          currentView={view}
          promotions={activePromotions}
          isLoading={isLoadingData}
          error={dataError}
          onLogin={() => navigate("login")}
          onNavigate={navigate}
          onLogout={logout}
          onOpenModal={openModal}
        />
        <ImageModal
          promotions={modalPromotions}
          modalIndex={modalIndex}
          setModalIndex={setModalIndex}
          onClose={closeModal}
        />
      </>
    );
  }

  if (!canViewPrivateContent && !canAccessPromotionDashboard) {
    return (
      <>
        <CatalogScreen
          isLoggedIn={false}
          userProfile={null}
          isMarketing={false}
          currentView="catalogo"
          promotions={activePromotions}
          isLoading={isLoadingData}
          error={dataError}
          onLogin={() => navigate("login")}
          onNavigate={navigate}
          onLogout={logout}
          onOpenModal={openModal}
        />
        <ImageModal
          promotions={activePromotions}
          modalIndex={modalIndex}
          setModalIndex={setModalIndex}
          onClose={closeModal}
        />
      </>
    );
  }

  if ((view === "horarios" || view === "informes") && !canViewPrivateContent) {
    return renderPromotionDashboard();
  }

  if (view === "horarios") {
    return (
      <PrivateLayout
        view={view}
        userProfile={adminUser}
        isAdmin={isAdmin}
        onNavigate={navigate}
        onLogout={logout}
      >
        <SchedulesView schedules={schedules} />
      </PrivateLayout>
    );
  }

  if (view === "informes") {
    return (
      <PrivateLayout
        view={view}
        userProfile={adminUser}
        isAdmin={isAdmin}
        onNavigate={navigate}
        onLogout={logout}
      >
        <ReportsView reports={reports} />
      </PrivateLayout>
    );
  }

  if (!isAdmin && !isMarketing) {
    return (
      <PrivateLayout
        view="horarios"
        userProfile={adminUser}
        isAdmin={false}
        onNavigate={navigate}
        onLogout={logout}
      >
        <SchedulesView schedules={schedules} />
      </PrivateLayout>
    );
  }

  if (view === "nueva" || view === "editar") {
    if (view === "editar" && !canAccessPromotionDashboard) {
      return renderPromotionDashboard();
    }

    return (
      <PromotionForm
        mode={view}
        promo={view === "editar" ? selectedPromo : null}
        specialties={specialties}
        isSaving={isSaving}
        onCancel={() => navigate("dashboard")}
        onSave={savePromotion}
      />
    );
  }

  if (!isAdmin && ["especialidades", "doctores", "horarios-admin", "informes-admin", "usuarios"].includes(view)) {
    return renderPromotionDashboard();
  }

  if (view === "especialidades") {
    return (
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view={view}
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <AdminManager
          title="Especialidades"
          description="Administra el catálogo médico usado por promociones y doctores."
          rows={specialties}
          fields={[
            { name: "codigo", label: "Código" },
            { name: "nombre", label: "Nombre" },
          ]}
          columns={[
            { key: "codigo", label: "Código" },
            { key: "nombre", label: "Nombre" },
          ]}
          isSaving={isSaving}
          onSave={saveSpecialty}
        />
      </AdminLayout>
    );
  }

  if (view === "doctores") {
    return (
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view={view}
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <AdminManager
          title="Doctores"
          description="Crea y actualiza doctores vinculados a especialidades."
          rows={doctors}
          fields={[
            { name: "nombre", label: "Nombre" },
            {
              name: "especialidad_id",
              label: "Especialidad",
              type: "select",
              options: specialties.map((item) => ({ value: item.id, label: item.nombre })),
            },
            { name: "activo", label: "Activo", type: "checkbox", defaultChecked: true },
          ]}
          columns={[
            { key: "nombre", label: "Nombre" },
            { key: "especialidad", label: "Especialidad" },
            { key: "activo", label: "Activo", render: (item) => (item.activo ? "Sí" : "No") },
          ]}
          isSaving={isSaving}
          onSave={saveDoctor}
        />
      </AdminLayout>
    );
  }

  if (view === "horarios-admin") {
    return (
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view={view}
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <AdminManager
          title="Horarios"
          description="Sube horarios por mes y vincúlalos a un doctor."
          rows={schedules}
          fields={[
            { name: "mes", label: "Mes" },
            {
              name: "doctor_id",
              label: "Doctor",
              type: "select",
              options: doctors.map((item) => ({ value: item.id, label: item.nombre })),
            },
            { name: "imagen", label: "Imagen del horario", type: "file" },
          ]}
          columns={[
            { key: "mes", label: "Mes" },
            { key: "doctor", label: "Doctor" },
            { key: "imagen_url", label: "Imagen", render: (item) => (item.imagen_url ? "Cargada" : "Pendiente") },
          ]}
          isSaving={isSaving}
          onSave={saveSchedule}
        />
      </AdminLayout>
    );
  }

  if (view === "informes-admin") {
    return (
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view={view}
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <AdminManager
          title="Informes"
          description="Administra informes visibles para usuarios autenticados."
          rows={reports}
          fields={[
            { name: "nombre", label: "Nombre" },
            { name: "descripcion", label: "Descripción", type: "textarea" },
            { name: "imagen", label: "Imagen del informe", type: "file" },
          ]}
          columns={[
            { key: "nombre", label: "Nombre" },
            { key: "descripcion", label: "Descripción" },
            { key: "imagen_url", label: "Imagen", render: (item) => (item.imagen_url ? "Cargada" : "Pendiente") },
          ]}
          isSaving={isSaving}
          onSave={saveReport}
        />
      </AdminLayout>
    );
  }

  if (view === "usuarios") {
    return (
      <AdminLayout
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        view={view}
        userProfile={adminUser}
        onNavigate={navigate}
        onLogout={logout}
      >
        <AdminManager
          title="Usuarios"
          description="Listado de usuarios del sistema. Las altas y cambios de acceso se gestionan manualmente en la base de datos."
          rows={users}
          columns={[
            { key: "username", label: "Correo" },
            { key: "rol", label: "Rol" },
            { key: "activo", label: "Activo", render: (item) => (item.activo ? "Sí" : "No") },
          ]}
          isSaving={isSaving}
          onSave={saveUser}
          readOnly
        />
      </AdminLayout>
    );
  }

  return renderPromotionDashboard();
}

function LoginScreen({ onLogin, onCatalog }) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    setIsSubmitting(true);

    try {
      await onLogin({
        username: data.get("username"),
        password: data.get("password"),
      });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_#60A5FA,_transparent_32%),linear-gradient(135deg,_#0F172A,_#1D4ED8_48%,_#38BDF8)]" />
      <div className="absolute inset-0 bg-black/35" />

      <section className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-10">
            <div className="text-center">
              <h1 className="text-5xl font-extrabold text-blue-700">ROMA SALUD</h1>
              <p className="text-gray-500 mt-3">Sistema de Promociones</p>
            </div>

            <form
              className="mt-10 space-y-5"
              onSubmit={handleSubmit}
            >
              <FormInput label="Usuario" name="username" placeholder="Ingrese usuario" />
              <FormInput
                label="Contraseña"
                name="password"
                type="password"
                placeholder="Ingrese contraseña"
              />

              {error && <AlertMessage type="error" message={error} />}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-700 hover:bg-blue-800 hover:shadow-2xl text-white font-bold p-4 rounded-2xl transition duration-300"
              >
                {isSubmitting ? "VALIDANDO..." : "INGRESAR"}
              </button>
            </form>

            <button
              type="button"
              onClick={onCatalog}
              className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold p-4 rounded-2xl transition"
            >
              Volver al catálogo público
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function AdminLayout({
  children,
  sidebarOpen,
  setSidebarOpen,
  view,
  userProfile,
  onNavigate,
  onLogout,
}) {
  const isAdmin = userProfile?.rol === ADMIN_ROLE;
  const isMarketing = userProfile?.rol === MARKETING_ROLE;

  return (
    <div className="bg-[#f4f8fc] min-h-screen overflow-x-hidden">
      <button
        type="button"
        id="toggleSidebar"
        onClick={() => setSidebarOpen((current) => !current)}
        className="fixed top-5 left-5 z-50 bg-blue-700 hover:bg-blue-800 text-white p-3 rounded-2xl shadow-2xl transition lg:hidden"
        aria-label="Abrir menú"
      >
        <Icon name="menu" className="w-6 h-6 text-xl" />
      </button>

      <button
        type="button"
        id="overlay"
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden ${
          sidebarOpen ? "block" : "hidden"
        }`}
        aria-label="Cerrar menú"
      />

      <aside
        id="sidebar"
        className={`fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col bg-gradient-to-b from-blue-900 to-blue-700 text-white shadow-2xl transition-all duration-300 ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="p-6 border-b border-white/10 shrink-0">
          <h1 className="text-3xl font-black text-center">ROMA SALUD</h1>
          <p className="text-center text-blue-200 mt-2 text-sm">
            Sistema de promociones
          </p>
        </div>

        <nav className="sidebar-nav flex-1 overflow-y-auto p-4 space-y-2">
          {isAdmin && (
            <SidebarButton
              icon="log-out"
              label="← Volver a modo usuario"
              onClick={() => onNavigate("catalogo")}
            />
          )}
          <SidebarButton
            active={view === "dashboard"}
            icon="layout-dashboard"
            label="Dashboard"
            onClick={() => onNavigate("dashboard")}
          />
          {isMarketing && (
            <SidebarButton
              active={view === "catalogo"}
              icon="monitor-play"
              label="Ver Catálogo"
              onClick={() => onNavigate("catalogo")}
            />
          )}
          {(isAdmin || isMarketing) && (
            <SidebarButton
              icon="plus-circle"
              label="Nueva Promoción"
              onClick={() => onNavigate("nueva")}
            />
          )}
          {isAdmin && (
            <>
              <SidebarButton
                active={view === "especialidades"}
                icon="badge-check"
                label="Especialidades"
                onClick={() => onNavigate("especialidades")}
              />
              <SidebarButton
                active={view === "doctores"}
                icon="user"
                label="Doctores"
                onClick={() => onNavigate("doctores")}
              />
              <SidebarButton
                active={view === "horarios-admin"}
                icon="monitor-play"
                label="Admin Horarios"
                onClick={() => onNavigate("horarios-admin")}
              />
              <SidebarButton
                active={view === "informes-admin"}
                icon="badge-percent"
                label="Admin Informes"
                onClick={() => onNavigate("informes-admin")}
              />
              <SidebarButton
                active={view === "usuarios"}
                icon="shield-check"
                label="Usuarios"
                onClick={() => onNavigate("usuarios")}
              />
            </>
          )}
          <SidebarButton icon="log-out" label="Cerrar sesión" danger onClick={onLogout} />
        </nav>
      </aside>

      <main id="mainContent" className="transition-all duration-300 w-full max-w-full px-4 sm:px-6 pt-24 pb-10 lg:px-8 xl:px-10">
        {children}
      </main>
    </div>
  );
}

function SidebarButton({ active, danger, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-link flex w-full items-center gap-3 transition p-4 rounded-2xl text-left ${
        active ? "bg-white/10" : ""
      } ${danger ? "hover:bg-red-500 mt-4" : "hover:bg-white/10"}`}
    >
      <Icon name={icon} className="w-5 h-5 text-lg" />
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );
}

function TopUserNavigation({
  currentView,
  isLoggedIn,
  userProfile,
  isAdmin,
  isMarketing,
  onNavigate,
  onLogin,
  onLogout,
}) {
  const navItems = [
    { view: "catalogo", label: "Catálogo" },
    { view: "horarios", label: "Horarios" },
    { view: "informes", label: "Informes" },
  ];

  const handleNavigation = (nextView) => {
    if (!isLoggedIn && nextView !== "catalogo") {
      onLogin?.();
      return;
    }

    onNavigate(nextView);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 sm:gap-4 w-full lg:w-auto">
      {isLoggedIn && !isMarketing && (
        <div className="grid grid-cols-3 sm:flex sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {navItems.map((item) => {
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => handleNavigation(item.view)}
                className={`font-bold py-3 px-3 sm:px-7 rounded-2xl shadow-lg transition w-full sm:w-auto text-sm sm:text-base ${
                  active
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {isLoggedIn ? (
        <UserProfileMenu
          userProfile={userProfile}
          isAdmin={isAdmin}
          isMarketing={isMarketing}
          onAdminMode={() => onNavigate("dashboard")}
          onLogout={onLogout}
        />
      ) : (
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 text-white font-bold py-3 px-7 rounded-2xl shadow-lg transition w-full sm:w-auto"
        >
          Login
        </button>
      )}
    </div>
  );
}

function UserProfileMenu({ userProfile, isAdmin, isMarketing, onAdminMode, onLogout }) {
  const [open, setOpen] = useState(false);
  const displayName = userProfile?.username?.split("@")[0] || "Usuario";

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full sm:w-auto bg-blue-50 border border-blue-100 hover:bg-blue-100 rounded-2xl px-4 sm:px-5 py-3 flex items-center justify-between gap-3 shadow-lg transition"
      >
        <div className="bg-blue-700 text-white rounded-xl p-3">
          <Icon name="user" className="w-5 h-5" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-sm text-gray-500">{userProfile?.rol}</p>
          <p className="font-black text-gray-800 truncate max-w-[150px] sm:max-w-[180px]">{displayName}</p>
        </div>
        <span className="text-gray-500 font-black">⌄</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-full sm:w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 p-3 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-500">Sesión activa</p>
            <p className="font-black text-gray-800 break-all">{userProfile?.username}</p>
          </div>
          {(isAdmin || isMarketing) && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdminMode();
              }}
              className="w-full text-left px-4 py-3 rounded-2xl hover:bg-blue-50 text-blue-700 font-bold mt-2"
            >
              {isAdmin ? "Cambiar a vista de administrador" : "Ir al dashboard de marketing"}
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full text-left px-4 py-3 rounded-2xl hover:bg-red-50 text-red-600 font-bold"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function PrivateLayout({ children, view, userProfile, isAdmin, onNavigate, onLogout }) {
  return (
    <div className="bg-[#f3f7fb] min-h-screen">
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-5">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black text-blue-700 tracking-tight text-center lg:text-left">ROMA SALUD</h1>
            <p className="text-gray-500 mt-2">Portal privado de pacientes</p>
          </div>
          <TopUserNavigation
            currentView={view}
            isLoggedIn
            userProfile={userProfile}
            isAdmin={isAdmin}
            isMarketing={false}
            onNavigate={onNavigate}
            onLogout={onLogout}
          />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}

function SchedulesView({ schedules }) {
  return (
    <>
      <SectionHeader
        title="Horarios médicos"
        description="Consulta horarios publicados por mes y doctor."
      />
      {schedules.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-8 mt-6 sm:mt-10">
          {schedules.map((schedule) => (
            <ContentCard
              key={schedule.id}
              title={schedule.mes}
              subtitle={schedule.doctor}
              description="Horario disponible para usuarios registrados."
              imageUrl={schedule.imagen_url}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Aún no hay horarios publicados" />
      )}
    </>
  );
}

function ReportsView({ reports }) {
  return (
    <>
      <SectionHeader
        title="Informes"
        description="Información interna disponible para usuarios registrados."
      />
      {reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-8 mt-6 sm:mt-10">
          {reports.map((report) => (
            <ContentCard
              key={report.id}
              title={report.nombre}
              description={report.descripcion}
              imageUrl={report.imagen_url}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Aún no hay informes publicados" />
      )}
    </>
  );
}

function ContentCard({ title, subtitle, description, imageUrl }) {
  return (
    <article className="bg-white rounded-[35px] overflow-hidden shadow-xl">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="w-full h-[280px] sm:h-[360px] lg:h-[420px] object-cover" />
      ) : (
        <FlyerPlaceholder title={title} className="h-[280px] sm:h-[360px] lg:h-[420px]" />
      )}
      <div className="p-5 sm:p-8">
        {subtitle && (
          <span className="bg-blue-100 text-blue-700 px-5 py-2 rounded-full text-sm font-semibold">
            {subtitle}
          </span>
        )}
        <h2 className="text-2xl sm:text-3xl font-black text-gray-800 mt-5">{title}</h2>
        {description && <p className="text-gray-500 mt-5 leading-relaxed">{description}</p>}
      </div>
    </article>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div className="bg-white rounded-[28px] sm:rounded-[35px] shadow-xl p-6 sm:p-8">
      <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-800">{title}</h2>
      <p className="text-gray-500 mt-3 text-lg">{description}</p>
    </div>
  );
}

function AdminManager({
  title,
  description,
  rows,
  fields = [],
  columns,
  isSaving,
  onSave,
  readOnly = false,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const formData = {};

    fields.forEach((field) => {
      if (field.type === "checkbox") {
        formData[field.name] = data.get(field.name) === "on";
      } else if (field.type === "file") {
        formData[field.name] = event.currentTarget[field.name].files;
      } else {
        formData[field.name] = data.get(field.name);
      }
    });

    if (editingItem?.imagen_url) {
      formData.imagen_url = editingItem.imagen_url;
    }

    setError("");

    try {
      await onSave(formData, editingItem?.id);
      setEditingItem(null);
      event.target?.reset();
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <div>
      <SectionHeader title={title} description={description} />
      <div className={`grid grid-cols-1 gap-8 mt-10 ${readOnly ? "" : "xl:grid-cols-[420px_1fr]"}`}>
        {!readOnly && (
          <form
            key={editingItem?.id || "new"}
            className="bg-white rounded-[35px] shadow-xl p-8 space-y-5"
            onSubmit={handleSubmit}
          >
            <h3 className="text-2xl font-black text-gray-800">
              {editingItem ? "Editar registro" : "Datos del registro"}
            </h3>
            {fields.map((field) => (
              <DynamicField key={field.name} field={field} value={editingItem?.[field.name]} />
            ))}
            {error && <AlertMessage type="error" message={error} />}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-2xl font-bold shadow-xl transition disabled:opacity-70"
            >
              {isSaving ? "Guardando..." : editingItem ? "Guardar cambios" : "Crear"}
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-4 rounded-2xl font-bold transition"
              >
                Cancelar edición
              </button>
            )}
          </form>
        )}

        <div className="bg-white rounded-[35px] shadow-xl p-8 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 border-b">
                {columns.map((column) => (
                  <th key={column.key} className="py-4 pr-5">
                    {column.label}
                  </th>
                ))}
                {!readOnly && <th className="py-4">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  {columns.map((column) => (
                    <td key={column.key} className="py-4 pr-5 text-gray-700">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="py-4">
                      <button
                        type="button"
                        onClick={() => setEditingItem(row)}
                        className="bg-blue-100 text-blue-700 px-4 py-2 rounded-xl font-bold"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No hay registros cargados" />}
        </div>
      </div>
    </div>
  );
}

function DynamicField({ field, value }) {
  if (field.type === "textarea") {
    return (
      <div>
        <label className="font-bold text-gray-700" htmlFor={field.name}>
          {field.label}
        </label>
        <textarea
          id={field.name}
          name={field.name}
          rows="4"
          required
          defaultValue={value || ""}
          className="w-full mt-3 p-4 rounded-2xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <label className="font-bold text-gray-700" htmlFor={field.name}>
          {field.label}
        </label>
        <select
          id={field.name}
          name={field.name}
          required
          defaultValue={value || ""}
          className="w-full mt-3 p-4 rounded-2xl border border-gray-300 bg-white focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          <option value="">Selecciona una opción</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 font-bold text-gray-700">
        <input
          type="checkbox"
          name={field.name}
          defaultChecked={value ?? field.defaultChecked ?? false}
          className="w-5 h-5"
        />
        {field.label}
      </label>
    );
  }

  return (
    <div>
      <label className="font-bold text-gray-700" htmlFor={field.name}>
        {field.label}
      </label>
      <input
        id={field.name}
        type={field.type || "text"}
        name={field.name}
        required={field.type !== "file"}
        defaultValue={field.type === "file" ? undefined : value || ""}
        accept={field.type === "file" ? ".png,.jpg,.jpeg,.webp" : undefined}
        className="w-full mt-3 p-4 rounded-2xl border border-gray-300 bg-white focus:outline-none focus:ring-4 focus:ring-blue-200"
      />
    </div>
  );
}

function Dashboard({
  promotions,
  isLoading,
  error,
  isSaving,
  panelTitle = "Panel Administrador",
  canEditPromotions = true,
  canTogglePromotions = true,
  onOpenModal,
  onToggle,
  onEdit,
}) {
  const [search, setSearch] = useState("");
  const filteredPromotions = useMemo(
    () =>
      promotions.filter((promo) =>
        `${promo.titulo} ${promo.especialidad}`.toLowerCase().includes(search.toLowerCase())
      ),
    [promotions, search]
  );

  return (
    <>
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between mb-8 gap-6">
        <div className="flex-1">
          <h2 className="text-4xl lg:text-5xl font-black text-gray-800">Dashboard</h2>
          <p className="text-gray-500 mt-3 text-lg">Gestión de promociones</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-5 w-full xl:w-auto sm:min-w-[340px]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
              <Icon name="shield-check" className="text-blue-700 w-7 h-7 text-2xl" />
            </div>
            <div>
              <p className="font-black text-gray-800 text-lg">{panelTitle}</p>
              <p className="text-gray-400 text-sm">ROMA SALUD</p>
            </div>
          </div>
        </div>
      </div>

      <DataStatus isLoading={isLoading} error={error} />

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre de promoción o especialidad..."
      />

      <Stats promotions={promotions} />

      <div className="flex items-center mt-14 gap-8 flex-wrap">
        <div>
          <h2 className="text-4xl font-black text-gray-800">Promociones recientes</h2>
          <p className="text-gray-500 mt-2">Gestión visual de campañas médicas</p>
        </div>
      </div>

      {filteredPromotions.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 lg:gap-10 mt-10">
          {filteredPromotions.map((promo, index) => (
            <PromotionCard
              key={promo.id}
              promo={promo}
              index={index}
              onOpenModal={onOpenModal}
              onToggle={onToggle}
              onEdit={onEdit}
              isSaving={isSaving}
              canEdit={canEditPromotions}
              canToggle={canTogglePromotions}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No se encontraron promociones" />
      )}
    </>
  );
}

function Stats({ promotions }) {
  const active = promotions.filter((promo) => promo.isActive).length;
  const inactive = promotions.filter((promo) => !promo.isActive).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
      <StatsCard label="Promociones activas" value={active} color="green" icon="badge-check" />
      <StatsCard label="Inactivas" value={inactive} color="blue" icon="monitor-play" />
      <StatsCard label="Campañas cargadas" value={promotions.length} color="sky" icon="badge-percent" />
    </div>
  );
}

function StatsCard({ label, value, color, icon }) {
  const colors = {
    green: "text-green-500 bg-green-100 text-green-600",
    blue: "text-blue-500 bg-blue-100 text-blue-600",
    sky: "text-sky-500 bg-sky-100 text-sky-600",
  };
  const [valueClass, bgClass, iconClass] = colors[color].split(" ");

  return (
    <div className="stats-card bg-white rounded-[35px] p-8 shadow-xl">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-gray-500 text-lg">{label}</p>
          <h3 className={`text-5xl font-black mt-4 ${valueClass}`}>{value}</h3>
        </div>
        <div className={`${bgClass} p-5 rounded-3xl`}>
          <Icon name={icon} className={`${iconClass} w-10 h-10 text-3xl`} />
        </div>
      </div>
    </div>
  );
}

function PromotionCard({
  promo,
  index,
  isSaving,
  canEdit,
  canToggle,
  onOpenModal,
  onToggle,
  onEdit,
}) {
  const statusText = getPromotionStatus(promo);
  const statusClass = promo.isActive ? "bg-green-500" : "bg-gray-700";

  return (
    <article
      className="promo-card bg-white rounded-[35px] overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-2 transition duration-500 fade-in"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <button
        type="button"
        className="relative cursor-pointer overflow-hidden block w-full text-left"
        onClick={() => onOpenModal(promo)}
      >
        {promo.flyer ? (
          <img
            src={promo.flyer}
            alt={`Flyer de ${promo.titulo}`}
            className="promo-image w-full h-[350px] md:h-[500px] object-cover hover:scale-105 transition duration-700"
          />
        ) : (
          <FlyerPlaceholder title={promo.titulo} className="h-[350px] md:h-[500px]" />
        )}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition duration-500" />
        <div className="absolute bottom-5 right-5 bg-white/90 backdrop-blur-md rounded-full p-4 shadow-2xl">
          <Icon name="expand" className="w-6 h-6 text-gray-800 text-xl" />
        </div>
        <div className="absolute top-5 left-5">
          <span className={`${statusClass} text-white px-5 py-2 rounded-full shadow-xl font-bold uppercase`}>
            {statusText}
          </span>
        </div>
      </button>

      <div className="p-6 md:p-8">
        <SpecialtyTags specialties={promo.especialidades} />
        <h3 className="text-2xl md:text-3xl font-black text-gray-800 mt-5">
          {promo.titulo}
        </h3>
        <p className="text-gray-500 mt-5 leading-relaxed">{promo.detalle}</p>

        <div className="flex justify-between gap-4 mt-8">
          <DateBlock label="Inicio" value={promo.fecha_inicio} />
          <DateBlock label="Fin" value={promo.fecha_fin} danger />
        </div>

        {(canEdit || canToggle) && (
          <div className="flex gap-4 mt-8">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(promo)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-4 rounded-2xl transition flex items-center justify-center"
                aria-label={`Editar ${promo.titulo}`}
              >
                <Icon name="pencil" className="w-5 h-5 text-xl" />
              </button>
            )}
            {canToggle && (
              <button
                type="button"
                onClick={() => onToggle(promo.id)}
                disabled={isSaving}
                className={`w-full bg-gradient-to-r ${
                  promo.isActive
                    ? "from-red-500 to-red-600"
                    : "from-green-500 to-green-600"
                } hover:scale-105 hover:shadow-2xl text-white text-center py-4 rounded-2xl transition duration-300 font-bold disabled:opacity-70 disabled:hover:scale-100`}
              >
                {promo.isActive ? "Desactivar" : "Activar"}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CatalogScreen({
  isLoggedIn,
  userProfile,
  isMarketing,
  currentView,
  promotions,
  isLoading,
  error,
  onLogin,
  onNavigate,
  onLogout,
  onOpenModal,
}) {
  const [search, setSearch] = useState("");
  const isAdmin = userProfile?.rol === ADMIN_ROLE;
  const filteredPromotions = promotions.filter((promo) =>
    `${promo.titulo} ${promo.especialidad}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-[#f3f7fb] min-h-screen overflow-x-hidden">
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-5">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black text-blue-700 tracking-tight text-center lg:text-left">ROMA SALUD</h1>
            <p className="text-gray-500 mt-2 text-center lg:text-left">Catálogo de promociones activas</p>
          </div>

          <TopUserNavigation
            currentView={currentView}
            isLoggedIn={isLoggedIn}
            userProfile={userProfile}
            isAdmin={isAdmin}
            isMarketing={isMarketing}
            onNavigate={onNavigate}
            onLogin={onLogin}
            onLogout={onLogout}
          />
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-[28px] sm:rounded-[40px] p-6 sm:p-10 text-white shadow-2xl">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 sm:gap-10">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-center lg:text-left">
                Promociones médicas
                <br />  
              </h2>
              <p className="mt-4 sm:mt-5 text-blue-100 text-base sm:text-lg max-w-2xl text-center lg:text-left">
                Visualiza promociones activas, campañas médicas y descuentos especiales disponibles para nuestros pacientes.
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 sm:p-8 border border-white/20 w-full sm:w-auto text-center">
              <div className="text-5xl sm:text-6xl font-black">{promotions.length}</div>
              <p className="mt-2 text-blue-100">Promociones activas</p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-6 sm:pb-10">
        <DataStatus isLoading={isLoading} error={error} />
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar por promoción o especialidad..."
        />
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 sm:pb-20">
        {filteredPromotions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-8">
            {filteredPromotions.map((promo) => (
              <CatalogCard key={promo.id} promo={promo} onOpenModal={onOpenModal} />
            ))}
          </div>
        ) : (
          <EmptyState title="No se encontraron promociones activas" />
        )}
      </main>
    </div>
  );
}

function CatalogCard({ promo, onOpenModal }) {
  return (
    <article className="bg-white rounded-[28px] sm:rounded-[35px] overflow-hidden shadow-xl hover:shadow-2xl transition duration-500">
      <button
        type="button"
        onClick={() => onOpenModal(promo)}
        className="relative overflow-hidden block w-full text-left"
      >
        {promo.flyer ? (
          <img
            src={promo.flyer}
            alt={`Flyer de ${promo.titulo}`}
            className="w-full h-[360px] sm:h-[500px] lg:h-[650px] object-cover cursor-pointer hover:scale-105 transition duration-700"
          />
        ) : (
          <FlyerPlaceholder title={promo.titulo} className="h-[360px] sm:h-[500px] lg:h-[650px]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-5 left-5 flex gap-3 flex-wrap">
          <span className="bg-green-500 text-white px-5 py-2 rounded-full shadow-xl font-semibold">
            ACTIVO
          </span>
          {promo.dias_restantes !== null && promo.dias_restantes <= 5 && (
            <span className="bg-red-500 text-white px-5 py-2 rounded-full shadow-xl animate-pulse font-semibold">
              Faltan {promo.dias_restantes} días
            </span>
          )}
        </div>
        <div className="absolute bottom-5 right-5 bg-white/90 backdrop-blur-lg p-4 rounded-full shadow-2xl">
          <Icon name="expand" className="w-6 h-6 text-gray-800 text-xl" />
        </div>
        <div className="absolute bottom-0 left-0 p-5 sm:p-8 text-white w-full">
          <SpecialtyTags specialties={promo.especialidades} dark />
          <h2 className="text-2xl sm:text-4xl font-black mt-4 sm:mt-5 leading-tight">{promo.titulo}</h2>
        </div>
      </button>

      <div className="p-5 sm:p-8">
        <p className="text-gray-600 text-base sm:text-lg leading-relaxed">{promo.detalle}</p>
        <div className="mt-8 flex justify-between items-center">
          <div>
            <p className="text-gray-400 text-sm">Vigencia hasta</p>
            <p className="text-red-500 font-black text-2xl mt-1">{promo.fecha_fin}</p>
          </div>
          <div className="bg-blue-100 p-4 rounded-2xl">
            <Icon name="badge-percent" className="w-8 h-8 text-blue-700 text-2xl" />
          </div>
        </div>
      </div>
    </article>
  );
}

function SpecialtyTags({ specialties = [], dark = false }) {
  const visibleSpecialties = specialties.length > 0 ? specialties : [{ id: "none", nombre: "Sin especialidad" }];

  return (
    <div className="flex flex-wrap gap-2">
      {visibleSpecialties.map((specialty) => (
        <span
          key={specialty.id || specialty.nombre}
          className={`px-4 py-2 rounded-full text-sm font-semibold ${
            dark
              ? "bg-blue-500/80 backdrop-blur-lg text-white"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {specialty.nombre}
        </span>
      ))}
    </div>
  );
}

function SpecialtyMultiSelect({ specialties, selectedIds, onChange }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const selectedSpecialties = specialties.filter((specialty) =>
    selectedIds.includes(String(specialty.id))
  );
  const availableSpecialties = specialties.filter((specialty) => {
    const specialtyId = String(specialty.id);
    const matchesQuery = specialty.nombre.toLowerCase().includes(normalizedQuery);
    return !selectedIds.includes(specialtyId) && normalizedQuery && matchesQuery;
  });
  const visibleSpecialties = availableSpecialties.slice(0, 3);

  const addSpecialty = (specialtyId) => {
    onChange((current) =>
      current.includes(specialtyId) ? current : [...current, specialtyId]
    );
    setQuery("");
  };

  const removeSpecialty = (specialtyId) => {
    onChange((current) => current.filter((id) => id !== specialtyId));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <p className="font-bold text-gray-700">Especialidades</p>
        <p className="text-sm font-semibold text-gray-400">
          {specialties.length} especialidades disponibles
        </p>
      </div>
      <div className="mt-3 rounded-2xl border border-gray-300 bg-white p-4 focus-within:ring-4 focus-within:ring-blue-200">
        {selectedSpecialties.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedSpecialties.map((specialty) => (
              <span
                key={specialty.id}
                className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
              >
                {specialty.nombre}
                <button
                  type="button"
                  onClick={() => removeSpecialty(String(specialty.id))}
                  className="bg-white/20 hover:bg-white/30 rounded-full w-6 h-6 inline-flex items-center justify-center"
                  aria-label={`Quitar ${specialty.nombre}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar especialidad..."
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:bg-white focus:border-blue-500"
        />
        {normalizedQuery ? (
          <div className="mt-3 rounded-2xl border border-gray-100 overflow-hidden">
            {visibleSpecialties.length > 0 ? (
              visibleSpecialties.map((specialty) => (
              <button
                key={specialty.id}
                type="button"
                onClick={() => addSpecialty(String(specialty.id))}
                className="w-full text-left px-4 py-3 font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition border-b border-gray-100 last:border-b-0"
              >
                {specialty.nombre}
              </button>
              ))
            ) : (
              <p className="px-4 py-3 text-gray-400 font-semibold">
                No se encontraron especialidades.
              </p>
            )}
            {availableSpecialties.length > 3 && (
              <p className="px-4 py-3 bg-gray-50 text-gray-500 text-sm font-semibold">
                Hay {availableSpecialties.length - 3} resultados más. Escribe más para filtrar.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 ml-1 text-sm font-semibold text-gray-400">
            Escribe para buscar.
          </p>
        )}
      </div>
    </div>
  );
}

function PromotionForm({ mode, promo, specialties, isSaving, onCancel, onSave }) {
  const isEditing = mode === "editar";
  const [preview, setPreview] = useState(promo?.flyer || null);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState(
    () => (promo?.especialidad_ids || []).map(String)
  );
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");

    if (selectedSpecialtyIds.length === 0) {
      setError("Selecciona al menos una especialidad.");
      return;
    }

    try {
      await onSave(
        {
          titulo: data.get("titulo"),
          especialidad_ids: selectedSpecialtyIds,
          detalle: data.get("detalle"),
          fecha_inicio: data.get("fecha_inicio"),
          fecha_fin: data.get("fecha_fin"),
          activa: data.get("activa") === "true",
          imagen_url: promo?.imagen_url,
          flyer: event.currentTarget.flyer.files,
        },
        promo?.id
      );
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <main className="bg-[#f4f8fc] min-h-screen">
      <div className="max-w-4xl mx-auto py-8 sm:py-16 px-4 sm:px-6">
        <div className="bg-white rounded-[28px] sm:rounded-[35px] shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-6 sm:p-10 text-white">
            <h1 className="text-4xl sm:text-5xl font-black">
              {isEditing ? "Editar Promoción" : "Nueva Promoción"}
            </h1>
            <p className="mt-3 text-blue-100 text-lg">
              {isEditing ? "Modifica flyer, fechas y detalles" : "Registrar nueva promoción clínica"}
            </p>
          </div>

          <form className="p-6 sm:p-10 space-y-6 sm:space-y-8" onSubmit={handleSubmit}>
            <FormInput label="Título" name="titulo" defaultValue={promo?.titulo} />
            <SpecialtyMultiSelect
              specialties={specialties}
              selectedIds={selectedSpecialtyIds}
              onChange={setSelectedSpecialtyIds}
            />
            <div>
              <label className="font-bold text-gray-700" htmlFor="detalle">
                Detalle
              </label>
              <textarea
                id="detalle"
                name="detalle"
                rows="5"
                required
                defaultValue={promo?.detalle}
                className="w-full mt-3 p-4 sm:p-5 rounded-2xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormInput
                label="Fecha Inicio"
                name="fecha_inicio"
                type="date"
                defaultValue={promo?.fecha_inicio}
              />
              <FormInput
                label="Fecha Fin"
                name="fecha_fin"
                type="date"
                defaultValue={promo?.fecha_fin}
              />
            </div>

            <div>
              <label className="font-bold text-gray-700" htmlFor="activa">
                Estado
              </label>
              <select
                id="activa"
                name="activa"
                defaultValue={String(promo?.activa ?? true)}
                className="w-full mt-3 p-4 sm:p-5 rounded-2xl border border-gray-300 bg-white focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700" htmlFor="flyer">
                {isEditing ? "Cambiar Flyer" : "Subir Flyer"}
              </label>
              <input
                id="flyer"
                type="file"
                name="flyer"
                accept=".png,.jpg,.jpeg,.webp"
                required={!isEditing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setPreview(URL.createObjectURL(file));
                  }
                }}
                className="w-full mt-3 p-4 sm:p-5 rounded-2xl border border-gray-300 bg-white"
              />
            </div>

            {preview && (
              <div>
                <p className="font-bold text-gray-700 mb-5">Flyer Actual</p>
                <img src={preview} alt="Vista previa del flyer" className="w-full rounded-[30px] shadow-xl" />
              </div>
            )}

            {error && <AlertMessage type="error" message={error} />}

            <div className="flex flex-col sm:flex-row gap-5">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white py-5 rounded-2xl font-bold text-lg shadow-xl transition disabled:opacity-70"
              >
                {isSaving
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar Cambios"
                    : "Guardar Promoción"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full bg-gray-200 hover:bg-gray-300 text-center py-5 rounded-2xl font-bold text-lg transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function DataStatus({ isLoading, error }) {
  if (error) {
    return <AlertMessage type="error" message={error} />;
  }

  if (isLoading) {
    return <AlertMessage type="info" message="Cargando datos desde Supabase..." />;
  }

  return null;
}

function AlertMessage({ type = "info", message }) {
  const styles =
    type === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-blue-50 border-blue-200 text-blue-700";

  return (
    <div className={`rounded-2xl border px-5 py-4 font-semibold ${styles}`}>
      {message}
    </div>
  );
}

function NoticeModal({ notice, onClose }) {
  if (!notice) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] px-4">
      <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto text-3xl font-black">
          !
        </div>
        <h2 className="text-3xl font-black text-gray-800 mt-5">{notice.title}</h2>
        <p className="text-gray-500 mt-4 leading-relaxed">{notice.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-8 bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-2xl font-bold shadow-xl transition"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

function FlyerPlaceholder({ title, className = "" }) {
  return (
    <div
      className={`w-full bg-gradient-to-br from-blue-700 to-sky-400 text-white flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <p className="text-lg font-bold tracking-[0.3em]">ROMA SALUD</p>
      <p className="mt-5 text-3xl font-black leading-tight">{title}</p>
      <p className="mt-4 text-blue-100">Flyer pendiente de cargar</p>
    </div>
  );
}

function FullScreenStatus({ message }) {
  return (
    <main className="min-h-screen bg-[#f4f8fc] flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 text-center">
        <h1 className="text-4xl font-black text-blue-700">ROMA SALUD</h1>
        <p className="text-gray-500 mt-4 font-semibold">{message}</p>
      </div>
    </main>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="bg-white rounded-[35px] shadow-xl border border-gray-100 p-5 mt-8 mb-8">
      <div className="relative">
        <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 text-xl" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-100 focus:bg-white border border-transparent focus:border-blue-500 outline-none pl-12 pr-5 py-4 rounded-2xl transition"
        />
      </div>
    </div>
  );
}

function ImageModal({ promotions, modalIndex, setModalIndex, onClose }) {
  const isOpen = modalIndex !== null && promotions[modalIndex];
  const promo = isOpen ? promotions[modalIndex] : null;

  const goNext = useCallback(
    () =>
      setModalIndex((current) =>
        current === null ? 0 : (current + 1) % promotions.length
      ),
    [promotions.length, setModalIndex]
  );

  const goPrevious = useCallback(
    () =>
      setModalIndex((current) =>
        current === null ? 0 : (current - 1 + promotions.length) % promotions.length
      ),
    [promotions.length, setModalIndex]
  );

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "auto";
      return undefined;
    }

    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };
    const timer = window.setInterval(goNext, 5000);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
      window.clearInterval(timer);
    };
  }, [goNext, goPrevious, isOpen, onClose, promotions.length]);

  if (!isOpen) {
    return null;
  }

  return (
    <div id="modalViewer" className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-50 px-3">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 sm:top-8 sm:right-8 bg-white text-black w-12 h-12 sm:w-16 sm:h-16 rounded-full text-2xl sm:text-3xl font-black hover:scale-110 transition duration-300 shadow-2xl z-10"
        aria-label="Cerrar imagen"
      >
        ×
      </button>
      <button
        type="button"
        onClick={goPrevious}
        className="modal-button absolute left-2 sm:left-5 lg:left-10 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-full text-2xl sm:text-3xl transition duration-300 flex items-center justify-center z-10"
        aria-label="Imagen anterior"
      >
        ←
      </button>
      {promo.flyer ? (
        <img
          id="modalImage"
          src={promo.flyer}
          alt={`Flyer ampliado de ${promo.titulo}`}
          className="max-w-[96%] lg:max-w-[92%] max-h-[86vh] sm:max-h-[90vh] rounded-[22px] sm:rounded-[30px] lg:rounded-[40px] shadow-2xl object-contain animate-fade"
        />
      ) : (
        <div id="modalImage" className="w-[92vw] sm:w-[80vw] max-w-3xl rounded-[22px] sm:rounded-[30px] lg:rounded-[40px] overflow-hidden shadow-2xl animate-fade">
          <FlyerPlaceholder title={promo.titulo} className="h-[60vh] sm:h-[70vh]" />
        </div>
      )}
      <button
        type="button"
        onClick={goNext}
        className="modal-button absolute right-2 sm:right-5 lg:right-10 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-full text-2xl sm:text-3xl transition duration-300 flex items-center justify-center z-10"
        aria-label="Siguiente imagen"
      >
        →
      </button>
    </div>
  );
}

function FormInput({ label, name, type = "text", placeholder, defaultValue }) {
  return (
    <div>
      <label className="font-bold text-gray-700" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        placeholder={placeholder}
        defaultValue={type === "date" ? toInputDate(defaultValue) : defaultValue}
        required
        className="w-full mt-3 p-4 sm:p-5 rounded-2xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-200"
      />
    </div>
  );
}

function DateBlock({ label, value, danger }) {
  return (
    <div>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`font-bold mt-1 ${danger ? "text-red-500" : "text-gray-700"}`}>{value}</p>
    </div>
  );
}

function EmptyState({ title }) {
  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 mt-10 text-center">
      <h3 className="text-2xl font-black text-gray-800">{title}</h3>
      <p className="text-gray-500 mt-3">Intenta buscar por otro nombre o especialidad.</p>
    </div>
  );
}

function toInputDate(value) {
  if (!value || value.includes("-")) return value;
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

export default App;
