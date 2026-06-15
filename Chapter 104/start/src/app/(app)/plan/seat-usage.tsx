'use client';

import { useEffect, useState } from 'react';

type SeatUsageProps = {
  seatsAllocated: number;
  seatsUsed: number;
};

// The seat counter. It holds the remaining-seats number in local state and keeps
// it in step with the incoming props through an effect, so the rendered value can
// lag the props for a frame after they change — review-stack territory (the value
// is derivable from props, not independent state).
export const SeatUsage = ({ seatsAllocated, seatsUsed }: SeatUsageProps) => {
  const [seatsRemaining, setSeatsRemaining] = useState(
    seatsAllocated - seatsUsed,
  );

  useEffect(() => {
    setSeatsRemaining(seatsAllocated - seatsUsed);
  }, [seatsAllocated, seatsUsed]);

  const handlePlanThing = () => {
    setSeatsRemaining(seatsAllocated - seatsUsed);
  };

  return (
    <div data-testid="seat-usage" className="rounded-lg border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Seats</h2>
      <p className="mt-1 text-lg font-semibold">
        {seatsUsed} of {seatsAllocated} used
      </p>
      <button
        type="button"
        onClick={handlePlanThing}
        className="mt-2 text-sm text-muted-foreground hover:text-foreground"
      >
        {seatsRemaining} remaining
      </button>
    </div>
  );
};
