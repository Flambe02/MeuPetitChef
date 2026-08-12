import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { EmptyState } from '@/components/ui/states';

export default function NotFoundScreen() {
  return (
    <EmptyState
      className="min-h-dvh justify-center"
      title="Essa página não existe"
      description="O endereço pode ter mudado."
      action={
        <Link to={routes.home} className="text-small font-semibold text-rouge">
          Voltar ao início
        </Link>
      }
    />
  );
}
