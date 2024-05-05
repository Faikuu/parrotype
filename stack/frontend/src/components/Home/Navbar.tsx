import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTwitter, faFacebook, faInstagram } from '@fortawesome/free-brands-svg-icons';
import { faIdCard, faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';
import { TApiCallParams, apiCall } from '@utils/api';
import { Translator } from '@utils/translator';
import { useNavigate } from 'react-router-dom';


export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const [isLoggedIn , setIsLoggedIn] = useState<boolean>(false);
  useEffect(() => {
    if (document.cookie.split('; ').some(row => row.startsWith('user='))) {
      setIsLoggedIn(true);
    }
  }, [])

  const handleLogout = async () => {
    const data: TApiCallParams = {
      url: `/auth/logout`,
      method: 'POST',
    };
    const response = await apiCall(data) as any;
    if (response.status < 300) {
      window.location.reload();
    }
  }


  return (
    <div className="fixed top-0 w-full flex justify-between items-center p-4 border-1 border-black text-white" style={{ boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.3)' }}>
      <div className='select-none flex flex-row'>
        <div onClick={() => navigate('/')} className='flex items-center cursor-pointer'>
          <img src='/logo.jpeg' height={64} width={64} alt="Logo" className="mr-2 rounded-full shadow-lg" />
          <p className='text-4xl font-bold'>Parro</p>
          <p className='text-5xl font-semibold'>T</p>
          <p className='text-4xl font-light'>ype</p>
        </div>
        <FontAwesomeIcon className='h-6 p-1' icon={faTwitter} />
        <FontAwesomeIcon className='h-6 p-1' icon={faFacebook} />
        <FontAwesomeIcon className='h-6 p-1' icon={faInstagram} />
      </div>
      {isLoggedIn ? 
      <div className='flex flex-row justify-center items-center'>
        <a href='/my-account'>
          <button className="text-white font-bold py-2 px-4 rounded-lg mr-2">
            <FontAwesomeIcon icon={faIdCard} />
          </button>
        </a>
        <button onClick={() => handleLogout()} className=" text-white font-bold py-2 px-4 rounded-lg">
          <FontAwesomeIcon icon={faRightToBracket} />
        </button>
      </div>
      :
      <div className='flex flex-row justify-center items-center'>
        <a href='/login'>
          <button className="text-white font-bold py-2 px-4 rounded-lg mr-2">
            <span>{Translator('login.title')}</span>
          </button>
        </a>
        <a href='/register'>
          <button className="text-white font-bold py-2 px-4 rounded-lg">
            <span>{Translator('register.title')}</span>
          </button>
        </a>
      </div>
      }
    </div>
  );
};
