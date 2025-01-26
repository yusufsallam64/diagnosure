import type { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { getProviders } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import AuthProviderBlock from "@/components/auth/AuthProviderBlock";
import dbClient from '@/lib/db/client';
import { useEffect, useState } from "react";

const SignIn = ({
    providers
}: InferGetServerSidePropsType<typeof getServerSideProps>): JSX.Element => {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    return (
        <div className="min-h-screen w-full relative overflow-hidden bg-background">
            {/* Animated gradient background */}
            <div
                className="absolute inset-0 opacity-50"
                style={{
                    background: `radial-gradient(circle at ${50 + mousePosition.x * 10}% ${50 + mousePosition.y * 10}%, 
                rgb(212, 131, 17) 0%,
                rgba(105, 117, 101, 0.5) 25%,
                rgba(40, 42, 39, 0.1) 50%)`
                }}
            />

            {/* Content container */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
                {/* Logo and title section */}
                <div className="text-center mb-12 space-y-4">
                    <h1 className="text-6xl font-bold text-text">
                        DiagnoSure
                    </h1>
                    <p className="text-xl text-primary-400">
                        Patient Health Reimagined
                    </p>
                </div>

                {/* Providers section */}
                <div className="w-full max-w-md space-y-4">
                    {Object.values(providers).map((provider) => (
                        <div
                            key={provider.id}
                            className="transform transition-all duration-300 hover:scale-105"
                        >
                            <AuthProviderBlock
                                providerName={provider.name}
                                iconLink={`/providers/${provider.id}.png`}
                                provider={provider}
                            />
                        </div>
                    ))}
                </div>

                {/* Decorative elements */}
                <div className="absolute top-0 left-0 w-96 h-96 bg-accent/10 rounded-full filter blur-3xl" />
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-secondary/10 rounded-full filter blur-3xl" />
            </div>
        </div>
    );
};

// TODO -- go in and fix all the auth stuff in getserversideprops for each function

export async function getServerSideProps(context: GetServerSidePropsContext) {
    const session = await getServerSession(context.req, context.res, authOptions);

    if (session) {
        const db = dbClient.db();
        const user = await db.collection('users').findOne({ email: session.user?.email });

        if (user?.role === 'patient') {
            return { redirect: { destination: '/dashboard', permanent: false } };
        } else if (user?.role === 'doctor') {
            return { redirect: { destination: '/doctorView', permanent: false } };
        }
    }

    const providers = await getProviders();

    return {
        props: { providers: providers ?? [] }
    };
}


export default SignIn;