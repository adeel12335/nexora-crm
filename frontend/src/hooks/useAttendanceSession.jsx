import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  createOfficePresence,
  evaluateOfficePresence,
} from '../utils/officeGeofence.js';

export function formatElapsed(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

const AttendanceContext = createContext(null);

function useAttendanceSessionState() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [openSession, setOpenSession] = useState(null);
  const [canCheckIn, setCanCheckIn] = useState(true);
  const [month, setMonth] = useState(null);
  const [elapsedBase, setElapsedBase] = useState(null);
  const [elapsedAt, setElapsedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const [emailsInput, setEmailsInput] = useState('');
  const [modalMode, setModalMode] = useState(null);
  const [geofence, setGeofence] = useState(null);
  const [geoPosition, setGeoPosition] = useState(null);
  const [geoErrorCode, setGeoErrorCode] = useState(null);
  const initialLoadDone = useRef(false);

  const applyToday = useCallback((data) => {
    setRecord(data.record);
    setActiveSession(data.activeSession);
    setSessions(data.sessions || []);
    setOpenSession(data.openSession);
    setCanCheckIn(Boolean(data.canCheckIn));
    setMonth(data.month);
    if (data.geofence) setGeofence(data.geofence);
    if (data.elapsedSeconds != null && data.activeSession) {
      setElapsedBase(data.elapsedSeconds);
      setElapsedAt(Date.now());
    } else {
      setElapsedBase(null);
      setElapsedAt(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    if (!initialLoadDone.current) setLoading(true);
    try {
      const data = await api.attendanceToday(token);
      applyToday(data);
      initialLoadDone.current = true;
    } catch (err) {
      showToastRef.current(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [token, applyToday]);

  useEffect(() => {
    load();
  }, [load]);

  const officePresence = useMemo(() => createOfficePresence(geofence), [geofence]);

  useEffect(() => {
    if (!officePresence.enabled) {
      setGeoPosition(null);
      setGeoErrorCode(null);
      return undefined;
    }
    if (!navigator.geolocation) {
      setGeoErrorCode('unavailable');
      return undefined;
    }

    const onOk = (pos) => {
      setGeoErrorCode(null);
      setGeoPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    };
    const onErr = (err) => {
      setGeoPosition(null);
      if (err?.code === 1) setGeoErrorCode('denied');
      else if (err?.code === 3) setGeoErrorCode('timeout');
      else setGeoErrorCode('unavailable');
    };

    const watchId = navigator.geolocation.watchPosition(onOk, onErr, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [officePresence.enabled]);

  const locationGate = useMemo(
    () => evaluateOfficePresence(officePresence.office, geoPosition, geoErrorCode),
    [officePresence.office, geoPosition, geoErrorCode]
  );

  useEffect(() => {
    if (!activeSession || elapsedBase == null) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession, elapsedBase]);

  const liveElapsed = useMemo(() => {
    if (elapsedBase == null || elapsedAt == null) return null;
    void tick;
    return elapsedBase + Math.floor((Date.now() - elapsedAt) / 1000);
  }, [elapsedBase, elapsedAt, tick]);

  const isWorking = Boolean(activeSession);
  const hasDayRecord = Boolean(record?.checkInTime);
  const late = record?.status === 'late';
  const status = !hasDayRecord ? 'out' : isWorking ? (late ? 'late' : 'in') : 'paused';
  const checkInBlockedByLocation = officePresence.enabled && (!locationGate.allowed || !locationGate.ready);

  async function handleCheckIn() {
    if (openSession) {
      setModalMode('open');
      showToastRef.current('Close yesterday’s open session first');
      return;
    }
    if (checkInBlockedByLocation) {
      showToastRef.current(locationGate.message || 'You are not in the office.');
      return;
    }
    setBusy(true);
    try {
      const body = geoPosition
        ? { lat: geoPosition.lat, lng: geoPosition.lng }
        : {};
      const data = await api.attendanceCheckIn(token, body);
      applyToday(data);
      showToastRef.current(
        data.reentry
          ? 'Checked in again'
          : data.late
            ? 'Checked in — marked as late'
            : 'Checked in — have a great day!'
      );
    } catch (err) {
      if (err.message?.includes('open session')) {
        await load();
        setModalMode('open');
      }
      showToastRef.current(err.message || 'Check-in failed');
    } finally {
      setBusy(false);
    }
  }

  function startCheckout() {
    setEmailsInput(String(record?.emailsSent ?? ''));
    setModalMode('checkout');
  }

  function startOpenClose() {
    setEmailsInput('0');
    setModalMode('open');
  }

  function startProgress() {
    setEmailsInput(String(record?.emailsSent ?? 0));
    setModalMode('progress');
  }

  async function confirmModal() {
    const emailsSent = Number(emailsInput);
    if (!Number.isInteger(emailsSent) || emailsSent < 0) {
      showToastRef.current('Enter emails sent (0 or more)');
      return;
    }
    setBusy(true);
    try {
      if (modalMode === 'progress') {
        const data = await api.attendanceProgress(token, { emailsSent });
        applyToday(data);
        showToastRef.current('Progress updated');
      } else if (modalMode === 'open') {
        const data = await api.attendanceCheckOut(token, {
          emailsSent,
          workDate: openSession.workDate,
          useDefaultTime: true,
        });
        applyToday(data);
        showToastRef.current('Previous session closed');
      } else {
        const data = await api.attendanceCheckOut(token, { emailsSent });
        applyToday(data);
        showToastRef.current('Checked out — you can check in again anytime today');
      }
      setModalMode(null);
      setEmailsInput('');
    } catch (err) {
      showToastRef.current(err.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  function cancelModal() {
    if (!busy) setModalMode(null);
  }

  return {
    loading,
    busy,
    record,
    activeSession,
    sessions,
    openSession,
    canCheckIn,
    month,
    liveElapsed,
    status,
    isWorking,
    hasDayRecord,
    emailsInput,
    setEmailsInput,
    modalMode,
    handleCheckIn,
    startCheckout,
    startOpenClose,
    startProgress,
    confirmModal,
    cancelModal,
    reload: load,
    locationGate,
    geofenceEnabled: officePresence.enabled,
    checkInBlockedByLocation,
  };
}

/** One shared attendance session for the whole agent/manager shell. */
export function AttendanceProvider({ children }) {
  const value = useAttendanceSessionState();
  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
}

export function useAttendanceSession() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) {
    throw new Error('useAttendanceSession must be used within AttendanceProvider');
  }
  return ctx;
}
