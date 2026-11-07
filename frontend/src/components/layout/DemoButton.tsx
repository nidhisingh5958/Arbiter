import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useSession } from '../../providers/SessionProvider';
import { Button, type ButtonSize } from '../ui/Button';

/** Seeds the three demo stories (happy path, failing PR, injection attempt) and opens the dashboard. */
export function DemoButton({ size = 'sm', label = 'Demo scenario' }: { size?: ButtonSize; label?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role, switchRole } = useSession();
  const run = useMutation({
    mutationFn: () => api.runDemo(true),
    onSuccess: (res) => {
      toast.success('Demo scenario started', { description: res.message });
      void qc.invalidateQueries();
      navigate('/dashboard');
    },
    onError: (e: Error) => toast.error('Could not start the demo', { description: e.message }),
  });
  return (
    <Button
      variant="agent"
      size={size}
      loading={run.isPending}
      icon={<Sparkles className="size-3.5" aria-hidden />}
      onClick={() => {
        if (role === 'contractor') switchRole('buyer');
        run.mutate();
      }}
    >
      {label}
    </Button>
  );
}
