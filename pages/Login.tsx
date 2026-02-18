import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const Login = () => {
   const navigate = useNavigate();
   const { signIn, user, loading: authLoading } = useAuth();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [loading, setLoading] = useState(false);

   // If already logged in, redirect to dashboard
   if (!authLoading && user) {
      return <Navigate to="/dashboard" replace />;
   }

   const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const { error } = await signIn(email, password);

      if (error) {
         setError('Email ou senha incorretos. Tente novamente.');
         setLoading(false);
      } else {
         navigate('/dashboard');
      }
   };

   return (
      <div class="relative flex min-h-screen w-full flex-col lg:flex-row bg-background-light">
         {/* Left Section: Abstract Hero Image */}
         <div class="relative w-full lg:w-1/2 h-64 lg:h-auto overflow-hidden bg-secondary">
            <div class="absolute inset-0 bg-cover bg-center transition-transform hover:scale-105 duration-[20s]"
               style={{ backgroundImage: 'url("https://picsum.photos/800/1200?grayscale&blur=1")' }}></div>
            <div class="absolute inset-0 bg-gradient-to-t from-secondary/60 to-transparent mix-blend-multiply"></div>
            <div class="absolute bottom-8 left-8 text-white z-10 hidden lg:block">
               <p class="font-mono text-sm opacity-80 mb-1">PAINEL DA ARTISTA</p>
               <h2 class="font-display text-2xl font-bold tracking-tight">Onde a arte encontra a organização.</h2>
            </div>
         </div>

         {/* Right Section: Login Form */}
         <div class="relative w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 bg-background-light">
            <div class="w-full max-w-md">
               <div class="flex flex-col items-center mb-12">
                  <div class="h-12 w-12 bg-primary mb-4 flex items-center justify-center shadow-hard border-2 border-secondary">
                     <span class="material-symbols-outlined text-white text-3xl">brush</span>
                  </div>
                  <h1 class="font-display text-4xl font-bold tracking-tight text-secondary text-center uppercase">Ateliê Thai Lago</h1>
                  <p class="font-mono text-sm text-[#1A1A1A]/60 mt-2 tracking-wide uppercase">Pinturas em Casamento</p>
               </div>

               {error && (
                  <div class="mb-6 p-4 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium flex items-center gap-3">
                     <span class="material-symbols-outlined text-lg">error</span>
                     {error}
                  </div>
               )}

               <form onSubmit={handleLogin} class="space-y-6">
                  <div class="group">
                     <label class="block text-sm font-bold text-secondary mb-2 font-display uppercase tracking-wider">E-mail</label>
                     <div class="relative">
                        <input
                           class="w-full bg-surface border-2 border-secondary p-4 text-lg placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="email"
                           placeholder="thai@atelie.com"
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           required
                           disabled={loading}
                        />
                        <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-secondary">
                           <span class="material-symbols-outlined">alternate_email</span>
                        </div>
                     </div>
                  </div>

                  <div class="group">
                     <div class="flex justify-between items-center mb-2">
                        <label class="block text-sm font-bold text-secondary font-display uppercase tracking-wider">Senha</label>
                     </div>
                     <div class="relative">
                        <input
                           class="w-full bg-surface border-2 border-secondary p-4 text-lg placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="password"
                           placeholder="••••••••"
                           value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           required
                           disabled={loading}
                        />
                        <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-secondary">
                           <span class="material-symbols-outlined">lock</span>
                        </div>
                     </div>
                  </div>

                  <div class="pt-4">
                     <button
                        type="submit"
                        disabled={loading}
                        class={`w-full bg-primary text-white font-display font-bold text-lg py-4 px-6 border-2 border-secondary shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-3 group/btn ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                     >
                        {loading ? (
                           <>
                              <span class="animate-spin material-symbols-outlined text-[20px]">progress_activity</span>
                              <span>Entrando...</span>
                           </>
                        ) : (
                           <>
                              <span>Entrar</span>
                              <span class="material-symbols-outlined transition-transform group-hover/btn:translate-x-1">arrow_forward</span>
                           </>
                        )}
                     </button>
                  </div>
               </form>

               <div class="mt-12 text-center border-t-2 border-secondary/10 pt-6">
                  <p class="text-sm text-secondary/60">
                     Precisa de acesso? <a href="#" class="text-primary font-bold hover:underline decoration-2 underline-offset-2">Solicitar Convite</a>
                  </p>
               </div>
            </div>
         </div>
      </div>
   );
};

export default Login;
