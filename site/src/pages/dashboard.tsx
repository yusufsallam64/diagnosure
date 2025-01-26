import React from 'react';
import type { GetServerSidePropsContext } from "next";
import { useSession, signOut } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { ArrowRight, User, LogOut } from 'lucide-react';
import { useRouter } from 'next/router';
import PastPreScreens from '@/components/PastPreScreens';
import DiagnosisList from '@/components/DiagnosisList';

const PreScreenButton = () => {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/prescreen')}
      className="w-full md:w-2/3 lg:w-1/2 mx-auto bg-primary-500 hover:bg-primary-600 transition-colors rounded-xl p-8 text-background-900 flex flex-col items-center justify-center group relative"
      aria-label="Start Pre-Screen Assessment"
    >
      <div className="flex items-center gap-4">
        <h2 className="font-heading text-2xl md:text-3xl font-bold">Start Pre-Screen Assessment</h2>
        <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
      </div>
      <p className="text-background-800 mt-2 font-body">
        Begin your healthcare journey with a quick assessment
      </p>
    </button>
  );
};

const Dashboard = () => {
    const { data: session } = useSession();
    
    return (
        <div className="min-h-screen bg-background-900 text-text p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center">
                            <User className="w-6 h-6 text-background-900" />
                        </div>
                        <div>
                            <h1 className="font-heading text-2xl md:text-3xl font-bold">
                                Welcome back, {session?.user?.name?.split(' ')[0]}
                            </h1>
                            <p className="text-text/80 font-body">
                                Your health dashboard
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-800 hover:bg-background-700 transition-colors"
                        aria-label="Sign out"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Sign out</span>
                    </button>
                </div>

                {/* Main CTA */}
                <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 to-secondary-500/20 blur-xl" />
                    <div className="relative">
                        <PreScreenButton />
                    </div>
                </div>

                {/* Past Pre-screens and Diagnoses */}
                <div className="grid md:grid-cols-2 gap-8">
                    <PastPreScreens />
                    <DiagnosisList />
                </div>
            </div>
        </div>
    );
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
    const session = await getServerSession(context.req, context.res, authOptions);
    
    if (!session) {
        return { redirect: { destination: "/auth/signin" } };
    }
    
    return {
        props: {}
    };
}

export default Dashboard;