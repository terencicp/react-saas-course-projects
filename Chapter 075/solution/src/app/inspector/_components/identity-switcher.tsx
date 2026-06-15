import { setIdentity } from '@/app/inspector/actions';
import type { ActiveIdentity } from '@/app/inspector/inspector-store';
import { Button } from '@/components/ui/button';

const OPTIONS: ActiveIdentity[] = ['alice', 'bob', 'unauthenticated'];

// The session-identity switcher: sets the active identity used for `email:` keys and
// spam targets. Each option submits the setIdentity Server Action bound to its value.
// One bounded element.
export const IdentitySwitcher = ({ active }: { active: ActiveIdentity }) => (
  <div
    data-testid="identity-switcher"
    className="inline-flex items-center gap-1 rounded-md border p-1"
  >
    {OPTIONS.map((option) => (
      <form key={option} action={setIdentity.bind(null, option)}>
        <Button
          type="submit"
          size="sm"
          variant={option === active ? 'default' : 'ghost'}
          data-active={option === active}
        >
          {option}
        </Button>
      </form>
    ))}
  </div>
);
