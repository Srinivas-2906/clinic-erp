/** Safe staging/local provider — never contacts real patients. */

export function createMockReminderProvider() {
  return {
    id: 'mock',
    send(job) {
      if (process.env.NODE_ENV !== 'test') {
        console.log('[reminder:mock]', JSON.stringify({
          kind: job.kind,
          tenantId: job.tenantId,
          appointmentId: job.appointmentId,
          recipientRedacted: job.recipient ? '***' : '',
        }));
      }
      return { ok: true, provider: 'mock' };
    },
  };
}
