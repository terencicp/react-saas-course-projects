import { ActionButton } from '@/app/inspector/_components/action-button';
import {
  sendOneReset,
  sendOneSignIn,
  sendOneSignUp,
  spamReset,
  spamSignIn,
  spamSignUp,
} from '@/app/inspector/actions';
import { Card } from '@/components/ui/card';

// The spam / send-one controls. "Spam X" runs the target action its over-budget count
// (sign-in 11×, sign-up 6×, reset 4×); "Send one" is the single-call walk. In scaffold
// state the student actions return err('internal', 'Not implemented'), so each call
// surfaces a "limiter not configured" outcome in the responses log without crashing.
// One bounded element.
export const Controls = () => (
  <Card data-testid="inspector-controls" className="gap-3 p-4">
    <div className="text-sm font-semibold">Run the gates</div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">sign-in</span>
      <ActionButton action={spamSignIn} size="sm" data-testid="spam-signin">
        Spam sign-in
      </ActionButton>
      <ActionButton
        action={sendOneSignIn}
        size="sm"
        variant="outline"
        data-testid="send-one-signin"
      >
        Send one
      </ActionButton>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">sign-up</span>
      <ActionButton action={spamSignUp} size="sm" data-testid="spam-signup">
        Spam sign-up
      </ActionButton>
      <ActionButton
        action={sendOneSignUp}
        size="sm"
        variant="outline"
        data-testid="send-one-signup"
      >
        Send one
      </ActionButton>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">reset</span>
      <ActionButton action={spamReset} size="sm" data-testid="spam-reset">
        Spam reset
      </ActionButton>
      <ActionButton
        action={sendOneReset}
        size="sm"
        variant="outline"
        data-testid="send-one-reset"
      >
        Send one
      </ActionButton>
    </div>
  </Card>
);
