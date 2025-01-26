import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowRight, ClipboardCheck, Stethoscope, UserCircle2, Loader2 } from 'lucide-react';
import LandingModel from '@/components/LandingModel';

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    setIsLoading(true);
    try {
      await router.push('/auth/signin');
    } catch (error) {
      console.error('Navigation error:', error);
    }
    setIsLoading(false);
  };

  const handleLearnMore = () => {
    document.getElementById('features')?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  };

  return (
    <div className="min-h-screen bg-background-900">
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-background-900 to-accent-400/5" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Column */}
            <div className="space-y-8">
              {/* Brand Badge */}
              <div className="inline-flex items-center space-x-2 bg-background-800 rounded-full px-4 py-2 text-sm">
                <Stethoscope className="w-4 h-4 text-primary-500" />
                <span className="text-text/80">Healthcare Solutions</span>
              </div>

              {/* Main Heading */}
              <div className="space-y-4">
                <h1 className="text-6xl font-bold font-heading">
                  <span className="text-text">Welcome to </span>
                  <span className="bg-gradient-to-r from-primary-500 via-secondary-500 to-accent-400 bg-clip-text text-transparent">
                    DiagnoSure
                  </span>
                </h1>
                <p className="text-xl text-text/80 font-body max-w-lg">
                  Experience streamlined healthcare management with our comprehensive patient portal
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleGetStarted}
                  disabled={isLoading}
                  className="group inline-flex items-center justify-center px-6 py-3 w-full bg-primary-500 hover:bg-primary-600 text-background-900 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Started</span>
                      <ArrowRight className="ml-2 w-4 h-4 transform transition-transform duration-300 group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>

              {/* Features Grid */}
              <div id="features" className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8">
                {[
                  {
                    icon: ClipboardCheck,
                    title: 'Pre-Screen Assessment',
                    description: 'Quick and thorough initial health evaluation'
                  },
                  {
                    icon: UserCircle2,
                    title: 'Patient Dashboard',
                    description: 'Track your health journey in one place'
                  },
                  {
                    icon: Stethoscope,
                    title: 'Professional Care',
                    description: 'Connect with healthcare providers'
                  }
                ].map((feature, index) => (
                  <div
                    key={index}
                    className="group p-4 bg-background-800 rounded-lg transition-all duration-300 hover:bg-background-700 transform hover:-translate-y-1 hover:shadow-lg"
                  >
                    <feature.icon className="w-6 h-6 text-primary-500 mb-3 transform transition-transform duration-300 group-hover:scale-110" />
                    <h3 className="font-heading font-bold text-text mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-text/70">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column - 3D Model */}
            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="absolute inset-0 bg-gradient-to-t from-background-900 via-transparent lg:hidden" />
              <div className="w-full max-w-lg">
                <div className="relative p-4 transition-transform duration-500 hover:scale-105">
                  <div className="absolute inset-0 bg-primary-500/5 rounded-2xl transform rotate-2" />
                  <div className="absolute inset-0 bg-accent-400/5 rounded-2xl transform -rotate-2" />
                  <div className="relative bg-background-800 rounded-xl p-4">
                    <LandingModel />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      {/* <div className="border-t border-background-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: 'Active Patients', value: '10k+' },
              { label: 'Healthcare Providers', value: '500+' },
              { label: 'Patient Satisfaction', value: '98%' },
              { label: 'Years of Service', value: '15+' }
            ].map((stat, index) => (
              <div 
                key={index} 
                className="text-center duration-300"
              >
                <div className="text-3xl font-bold text-primary-500 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-text/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div> */}
    </div>
  );
}