import React from 'react';
import { Composition } from 'remotion';
import { Comp1_LinkUpQuiz } from './compositions/Comp1_LinkUpQuiz';
import { Comp2_AuctionDraft } from './compositions/Comp2_AuctionDraft';
import { Comp3_FootballImposter } from './compositions/Comp3_FootballImposter';
import { Comp4_SideNettingFlex } from './compositions/Comp4_SideNettingFlex';
import { Comp5_PlatformTrailer } from './compositions/Comp5_PlatformTrailer';
import '../index.css';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1. The Link-Up Fast-Paced Quiz (16s = 480 frames) */}
      <Composition
        id="Comp1-LinkUpQuiz"
        component={Comp1_LinkUpQuiz}
        durationInFrames={480}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 2. Auction Draft $20 Budget Builder (18s = 540 frames) */}
      <Composition
        id="Comp2-AuctionDraft"
        component={Comp2_AuctionDraft}
        durationInFrames={540}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 3. Football Imposter Suspense Lie Detector (17s = 510 frames) */}
      <Composition
        id="Comp3-FootballImposter"
        component={Comp3_FootballImposter}
        durationInFrames={510}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 4. Side Netting 98.4% Obscurity Flex (17s = 510 frames) */}
      <Composition
        id="Comp4-SideNettingFlex"
        component={Comp4_SideNettingFlex}
        durationInFrames={510}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 5. Added Time 5-Mode Platform Trailer (19s = 570 frames) */}
      <Composition
        id="Comp5-PlatformTrailer"
        component={Comp5_PlatformTrailer}
        durationInFrames={570}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
