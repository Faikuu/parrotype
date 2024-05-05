import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { TApiCallParams, apiCall } from "@utils/api";
import { Translator } from "@utils/translator";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function RegisterComponent() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function registerUser({ name, email, password }: { name: string, email: string, password: string }) {
    const data: TApiCallParams = {
      url: `/auth/register`,
      method: 'POST',
      body: { name, email, password }
    };
    const response = await apiCall(data) as any;
    if (response.status < 300){
      navigate('/');
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    registerUser({ name, email, password });
  };

  return (
    <div className="flex flex-col justify-center items-center">
      <img className="h-32 rounded-full" src="/logo.jpeg" alt="logo" />
      <div className="border-2 rounded-lg w-1/3 mt-8 flex flex-col justify-center items-center">
        <h1 className="m-4 text-3xl flex flex-row gap-4">
          <button>
            <FontAwesomeIcon icon={faArrowLeft} onClick={() => navigate('/')} />
          </button>
          <span className="font-extrabold">{Translator('register.title')}</span>
        </h1>
        <form className="flex flex-col justify-center items-center" onSubmit={handleSubmit}>
          <input
            className="border-2 border-slate-300 rounded-md p-1"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={Translator('register.username')}
          />
          <input
            className="border-2 border-slate-300 rounded-md mt-2 p-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={Translator('register.email')}
          />
          <input
            className="border-2 border-slate-300 rounded-md mt-2 p-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={Translator('register.password')}
          />
          <button className="hover:bg-emerald-300 transition-all rounded-lg p-2 m-2 w-full" type="submit">{Translator('register.signUp')}</button>
        </form>
      </div>
    </div>
  );
}
