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

      try {
         const { error } = await signIn(email, password);

         if (error) {
            const errorMsg = (error as any)?.message || '';
            if (errorMsg.includes('Invalid login credentials')) {
               setError('Email ou senha incorretos. Tente novamente.');
            } else if (errorMsg.includes('Email not confirmed')) {
               setError('Email não confirmado. Verifique sua caixa de entrada.');
            } else {
               setError(errorMsg || 'Erro ao conectar. Tente novamente em alguns instantes.');
            }
            setLoading(false);
         } else {
            navigate('/dashboard');
         }
      } catch {
         setError('Erro de conexão. Verifique sua internet e tente novamente.');
         setLoading(false);
      }
   };

   const [currentImageIndex, setCurrentImageIndex] = useState(0);

   const backgroundImages = [
      'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?q=80&w=2070&auto=format&fit=crop', // Wedding/Elegance
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?q=80&w=2080&auto=format&fit=crop', // Artist painting
      'https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=2071&auto=format&fit=crop', // Art studio
   ];

   React.useEffect(() => {
      const interval = setInterval(() => {
         setCurrentImageIndex((prev) => (prev + 1) % backgroundImages.length);
      }, 5000);
      return () => clearInterval(interval);
   }, []);

   return (
      <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-background-light">
         {/* Left Section: Abstract Hero Image */}
         <div className="relative w-full lg:w-1/2 h-64 lg:h-auto overflow-hidden bg-secondary">
            {backgroundImages.map((image, index) => (
               <div
                  key={image}
                  className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${index === currentImageIndex ? 'opacity-100' : 'opacity-0'
                     }`}
                  style={{ backgroundImage: `url("${image}")` }}
               />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 to-transparent mix-blend-multiply"></div>
            <div className="absolute bottom-8 left-8 text-white z-10 hidden lg:block">
               <p className="font-mono text-sm opacity-80 mb-1">PAINEL DA ARTISTA</p>
               <h2 className="font-display text-2xl font-bold tracking-tight">Onde a arte encontra a organização.</h2>
               <div className="flex gap-2 mt-4">
                  {backgroundImages.map((_, idx) => (
                     <div
                        key={idx}
                        className={`h-1 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
                     />
                  ))}
               </div>
            </div>
         </div>

         {/* Right Section: Login Form */}
         <div className="relative w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 bg-background-light">
            <div className="w-full max-w-md">
               <div className="flex flex-col items-center mb-12">
                  <div className="h-12 w-12 bg-primary mb-4 flex items-center justify-center shadow-hard border-2 border-secondary">
                     <span className="material-symbols-outlined text-white text-3xl">brush</span>
                  </div>
                  <h1 className="font-display text-4xl font-bold tracking-tight text-secondary text-center uppercase">Ateliê Thai Lago</h1>
                  <p className="font-mono text-sm text-[#1A1A1A]/60 mt-2 tracking-wide uppercase">Pinturas em Casamento</p>
               </div>

               {error && (
                  <div className="mb-6 p-4 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium flex items-center gap-3">
                     <span className="material-symbols-outlined text-lg">error</span>
                     {error}
                  </div>
               )}

               <form onSubmit={handleLogin} className="space-y-6">
                  <div className="group">
                     <label className="block text-sm font-bold text-secondary mb-2 font-display uppercase tracking-wider">E-mail</label>
                     <div className="relative">
                        <input
                           className="w-full bg-surface border-2 border-secondary p-4 text-lg placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="email"
                           placeholder="thai@atelie.com"
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           required
                           disabled={loading}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-secondary">
                           <span className="material-symbols-outlined">alternate_email</span>
                        </div>
                     </div>
                  </div>

                  <div className="group">
                     <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-secondary font-display uppercase tracking-wider">Senha</label>
                     </div>
                     <div className="relative">
                        <input
                           className="w-full bg-surface border-2 border-secondary p-4 text-lg placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="password"
                           placeholder="••••••••"
                           value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           required
                           disabled={loading}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-secondary">
                           <span className="material-symbols-outlined">lock</span>
                        </div>
                     </div>
                  </div>

                  <div className="pt-4">
                     <button
                        type="submit"
                        disabled={loading}
                        className={`w-full bg-primary text-white font-display font-bold text-lg py-4 px-6 border-2 border-secondary shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-3 group/btn ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                     >
                        {loading ? (
                           <>
                              <span className="animate-spin material-symbols-outlined text-[20px]">progress_activity</span>
                              <span>Entrando...</span>
                           </>
                        ) : (
                           <>
                              <span>Entrar</span>
                              <span className="material-symbols-outlined transition-transform group-hover/btn:translate-x-1">arrow_forward</span>
                           </>
                        )}
                     </button>
                  </div>
               </form>

               <div className="mt-12 text-center border-t-2 border-secondary/10 pt-6">
                  <p className="text-sm text-secondary/60">
                     Precisa de acesso? Fale com a administração do ateliê.
                  </p>
               </div>
            </div>
         </div>

      </div>
   );
};

export default Login;
