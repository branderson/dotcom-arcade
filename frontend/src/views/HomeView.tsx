import { GameOfTheDay } from '@/components/portal/home/GameOfTheDay';
import { JumpBackIn, PlaylistShelves } from '@/components/portal/home/Shelves';
import { TimeMachine } from '@/components/portal/home/TimeMachine';

export function HomeView() {
  return (
    <div className="space-y-[18px]">
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[18px]">
        <GameOfTheDay />
        <TimeMachine />
      </div>
      <JumpBackIn />
      <PlaylistShelves />
    </div>
  );
}
