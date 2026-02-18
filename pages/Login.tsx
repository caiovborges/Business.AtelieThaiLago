import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const Login = () => {
   const navigate = useNavigate();
   const { signIn, signUp, user, loading: authLoading } = useAuth();
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [success, setSuccess] = useState('');
   const [loading, setLoading] = useState(false);

   // Signup modal state
   const [showSignup, setShowSignup] = useState(false);
   const [signupName, setSignupName] = useState('');
   const [signupEmail, setSignupEmail] = useState('');
   const [signupPassword, setSignupPassword] = useState('');
   const [signupConfirm, setSignupConfirm] = useState('');
   const [signupError, setSignupError] = useState('');
   const [signupSuccess, setSignupSuccess] = useState('');
   const [signupLoading, setSignupLoading] = useState(false);

   // If already logged in, redirect to dashboard
   if (!authLoading && user) {
      return <Navigate to="/dashboard" replace />;
   }

   const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccess('');
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
               setError('Erro ao conectar. Tente novamente em alguns instantes.');
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

   const handleSignup = async (e: React.FormEvent) => {
      e.preventDefault();
      setSignupError('');
      setSignupSuccess('');

      if (signupPassword.length < 6) {
         setSignupError('A senha deve ter pelo menos 6 caracteres.');
         return;
      }

      if (signupPassword !== signupConfirm) {
         setSignupError('As senhas não coincidem.');
         return;
      }

      setSignupLoading(true);

      try {
         const { error } = await signUp(signupEmail, signupPassword, signupName);

         if (error) {
            const errorMsg = (error as any)?.message || '';
            if (errorMsg.includes('already registered')) {
               setSignupError('Este email já está cadastrado.');
            } else {
               setSignupError('Erro ao criar conta. Tente novamente.');
            }
         } else {
            setSignupSuccess('Conta criada com sucesso! Você já pode fazer login.');
            setTimeout(() => {
               setShowSignup(false);
               setSignupSuccess('');
               setEmail(signupEmail);
               setPassword('');
               setSuccess('Conta criada! Faça login com suas credenciais.');
            }, 2000);
         }
      } catch {
         setSignupError('Erro de conexão. Tente novamente.');
      } finally {
         setSignupLoading(false);
      }
   };

   const openSignup = (e: React.MouseEvent) => {
      e.preventDefault();
      setShowSignup(true);
      setSignupError('');
      setSignupSuccess('');
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      setSignupConfirm('');
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
      <div class="relative flex min-h-screen w-full flex-col lg:flex-row bg-background-light">
         {/* Left Section: Abstract Hero Image */}
         <div class="relative w-full lg:w-1/2 h-64 lg:h-auto overflow-hidden bg-secondary">
            {backgroundImages.map((image, index) => (
               <div
                  key={image}
                  class={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${index === currentImageIndex ? 'opacity-100' : 'opacity-0'
                     }`}
                  style={{ backgroundImage: `url("${image}")` }}
               />
            ))}
            <div class="absolute inset-0 bg-gradient-to-t from-secondary/80 to-transparent mix-blend-multiply"></div>
            <div class="absolute bottom-8 left-8 text-white z-10 hidden lg:block">
               <p class="font-mono text-sm opacity-80 mb-1">PAINEL DA ARTISTA</p>
               <h2 class="font-display text-2xl font-bold tracking-tight">Onde a arte encontra a organização.</h2>
               <div class="flex gap-2 mt-4">
                  {backgroundImages.map((_, idx) => (
                     <div
                        key={idx}
                        class={`h-1 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
                     />
                  ))}
               </div>
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

               {success && (
                  <div class="mb-6 p-4 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium flex items-center gap-3">
                     <span class="material-symbols-outlined text-lg">check_circle</span>
                     {success}
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
                     Precisa de acesso? <a href="#" onClick={openSignup} class="text-primary font-bold hover:underline decoration-2 underline-offset-2">Solicitar Convite</a>
                  </p>
               </div>
            </div>
         </div>

         {/* Signup Modal */}
         {showSignup && (
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignup(false)}>
               <div
                  class="bg-background-light border-2 border-secondary shadow-hard w-full max-w-md p-8 relative animate-in"
                  onClick={(e) => e.stopPropagation()}
               >
                  <button
                     onClick={() => setShowSignup(false)}
                     class="absolute top-4 right-4 text-secondary/50 hover:text-secondary transition-colors"
                  >
                     <span class="material-symbols-outlined">close</span>
                  </button>

                  <div class="flex flex-col items-center mb-8">
                     <div class="h-10 w-10 bg-primary mb-3 flex items-center justify-center shadow-hard border-2 border-secondary">
                        <span class="material-symbols-outlined text-white text-2xl">person_add</span>
                     </div>
                     <h2 class="font-display text-2xl font-bold tracking-tight text-secondary uppercase">Solicitar Acesso</h2>
                     <p class="font-mono text-xs text-secondary/50 mt-1 tracking-wide uppercase">Crie sua conta</p>
                  </div>

                  {signupError && (
                     <div class="mb-4 p-3 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium flex items-center gap-2">
                        <span class="material-symbols-outlined text-lg">error</span>
                        {signupError}
                     </div>
                  )}

                  {signupSuccess && (
                     <div class="mb-4 p-3 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium flex items-center gap-2">
                        <span class="material-symbols-outlined text-lg">check_circle</span>
                        {signupSuccess}
                     </div>
                  )}

                  <form onSubmit={handleSignup} class="space-y-4">
                     <div>
                        <label class="block text-xs font-bold text-secondary mb-1.5 font-display uppercase tracking-wider">Nome</label>
                        <input
                           class="w-full bg-surface border-2 border-secondary p-3 text-base placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="text"
                           placeholder="Seu nome completo"
                           value={signupName}
                           onChange={(e) => setSignupName(e.target.value)}
                           required
                           disabled={signupLoading}
                        />
                     </div>

                     <div>
                        <label class="block text-xs font-bold text-secondary mb-1.5 font-display uppercase tracking-wider">E-mail</label>
                        <input
                           class="w-full bg-surface border-2 border-secondary p-3 text-base placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="email"
                           placeholder="seu@email.com"
                           value={signupEmail}
                           onChange={(e) => setSignupEmail(e.target.value)}
                           required
                           disabled={signupLoading}
                        />
                     </div>

                     <div>
                        <label class="block text-xs font-bold text-secondary mb-1.5 font-display uppercase tracking-wider">Senha</label>
                        <input
                           class="w-full bg-surface border-2 border-secondary p-3 text-base placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="password"
                           placeholder="Mínimo 6 caracteres"
                           value={signupPassword}
                           onChange={(e) => setSignupPassword(e.target.value)}
                           required
                           minLength={6}
                           disabled={signupLoading}
                        />
                     </div>

                     <div>
                        <label class="block text-xs font-bold text-secondary mb-1.5 font-display uppercase tracking-wider">Confirmar Senha</label>
                        <input
                           class="w-full bg-surface border-2 border-secondary p-3 text-base placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                           type="password"
                           placeholder="Repita a senha"
                           value={signupConfirm}
                           onChange={(e) => setSignupConfirm(e.target.value)}
                           required
                           minLength={6}
                           disabled={signupLoading}
                        />
                     </div>

                     <div class="pt-2">
                        <button
                           type="submit"
                           disabled={signupLoading}
                           class={`w-full bg-primary text-white font-display font-bold text-base py-3.5 px-6 border-2 border-secondary shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-3 ${signupLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                           {signupLoading ? (
                              <>
                                 <span class="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                                 <span>Criando...</span>
                              </>
                           ) : (
                              <>
                                 <span>Criar Conta</span>
                                 <span class="material-symbols-outlined">how_to_reg</span>
                              </>
                           )}
                        </button>
                     </div>
                  </form>

                  <div class="mt-6 text-center">
                     <p class="text-xs text-secondary/50">
                        Já tem conta?{' '}
                        <button onClick={() => setShowSignup(false)} class="text-primary font-bold hover:underline decoration-2 underline-offset-2">
                           Fazer Login
                        </button>
                     </p>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Login;
