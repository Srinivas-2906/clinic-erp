import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchDoctors,
  createDoctor,
  updateDoctor,
  fetchDoctorSessions,
  saveDoctorSessions,
  fetchDoctorTimeOff,
  createDoctorTimeOff,
  deleteDoctorTimeOff,
} from '../lib/api';
import { resolveTenantSlug } from '../lib/tenant';
import type { Doctor, DoctorSession } from '../types';

function doctorsKey(includeInactive: boolean) {
  return ['doctors', resolveTenantSlug(), includeInactive] as const;
}

export function useDoctors(includeInactive = false) {
  const tenant = resolveTenantSlug();
  return useQuery({
    queryKey: doctorsKey(includeInactive),
    queryFn: async () => {
      const data = await fetchDoctors(includeInactive);
      return data.doctors;
    },
    enabled: !!tenant,
    staleTime: 30_000,
  });
}

export function useDoctorSessions(doctorId: string | null, enabled = false) {
  return useQuery({
    queryKey: ['doctor-sessions', doctorId],
    queryFn: async () => {
      if (!doctorId) return [];
      const data = await fetchDoctorSessions(doctorId);
      return data.sessions;
    },
    enabled: enabled && !!doctorId,
    staleTime: 60_000,
  });
}

export function useCreateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Doctor> & { name: string }) => createDoctor(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

export function useUpdateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Doctor> }) => updateDoctor(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
      qc.invalidateQueries({ queryKey: ['doctor-sessions'] });
    },
  });
}

export function useSaveDoctorSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      doctorId,
      sessions,
    }: {
      doctorId: string;
      sessions: Omit<DoctorSession, 'id' | 'tenantId' | 'doctorId' | 'createdAt' | 'updatedAt'>[];
    }) => saveDoctorSessions(doctorId, sessions),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['doctor-sessions', vars.doctorId] });
    },
  });
}

export function useDoctorTimeOff(doctorId: string | null, enabled = false) {
  return useQuery({
    queryKey: ['doctor-time-off', doctorId],
    queryFn: async () => {
      if (!doctorId) return [];
      const data = await fetchDoctorTimeOff(doctorId);
      return data.timeOff;
    },
    enabled: enabled && !!doctorId,
    staleTime: 30_000,
  });
}

export function useCreateDoctorTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      doctorId,
      data,
    }: {
      doctorId: string;
      data: { startDatetime: string; endDatetime: string; reason?: string };
    }) => createDoctorTimeOff(doctorId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['doctor-time-off', vars.doctorId] });
    },
  });
}

export function useDeleteDoctorTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, offId }: { doctorId: string; offId: string }) => deleteDoctorTimeOff(doctorId, offId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['doctor-time-off', vars.doctorId] });
    },
  });
}
