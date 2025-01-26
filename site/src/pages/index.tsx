import React from 'react';
import LandingModel from '@/components/LandingModel';
import { useRouter } from 'next/router';


export default function LandingPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-primary/30 flex items-center justify-center p-4">
      <div className="max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left Column */}
        <div className="space-y-8 flex flex-col justify-center m-10">
          <div className="space-y-4">
            <h1 className="text-7xl font-bold text-text tracking-tight">
              <span className="inline-block bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
                EMCV
              </span>
            </h1>
            <p className="text-xl text-text font-ReThink font-semibold">
              Patient Health Reimagined
            </p>
          </div>

          <button
            onClick={() => { router.push('/auth/signin') }}
            className="mt-2 text-white border border-accent hover:bg-accent transition-all p-2 px-4 rounded-md w-60"
          >
            <span className="font-medium">Sign In</span>
          </button>
        </div>

        <div className="space-y-8">
          <div className="w-full max-w-md mx-auto">
            <LandingModel />
          </div>
        </div>
      </div>
    </div>
  );
}