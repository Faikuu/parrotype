import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { TApiCallParams, apiCall } from '@utils/api';
import { Translator } from '@utils/translator';
import React, { useState } from 'react';
import { useNavigate } from "react-router-dom";

export function LoginComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function loginUser({ email, password }: { email: string, password: string }) {
    const data: TApiCallParams = {
      url: `/auth/login`,
      method: 'POST',
      body: { email, password }
    };
    const response = await apiCall(data) as any;
    if (response.status < 300) {
      const userObject = JSON.stringify({email});
      document.cookie = `user=${userObject}; path=/; max-age=31536000`;
      navigate('/');
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginUser({ email, password });
  };

  return (
    <div className="flex flex-col justify-center items-center">
      <img className="h-32 rounded-full" src="/logo.jpeg" alt="logo" />
      <div className="border-2 rounded-lg w-1/3 mt-8 flex flex-col justify-center items-center">
        <h1 className="m-4 text-3xl flex flex-row gap-4">
          <button>
            <FontAwesomeIcon icon={faArrowLeft} onClick={() => navigate('/')} />
          </button>
          <span className="font-extrabold">{Translator('login.title')}</span>
        </h1>
        <form className="" onSubmit={handleSubmit}>
          <input type="hidden" name="remember" value="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">{Translator('login.email')}</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-2 border-slate-300 rounded-md p-1"
                placeholder={Translator('login.email')}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">{Translator('login.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-2 border-slate-300 rounded-md p-1 mt-2"
                placeholder={Translator('login.password')}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 my-2 border border-transparent text-sm font-medium rounded-md text-white  hover:bg-green-400"
            >
              {Translator('login.login')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
