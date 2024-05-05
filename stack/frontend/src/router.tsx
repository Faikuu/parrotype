import Home from '@components/Home';
import { Login } from '@routes/Login';
import { MyAccountRoute } from '@routes/MyAccount';
import { Register } from '@routes/Register';
import { Route, Routes } from 'react-router-dom';


export function AppRouter() {
  return (
    <Routes>
      <Route path='/' element={
        <Home/>
      }>
      </Route>
      <Route path='/login' element={
        <Login/>
      }>
      </Route>
      <Route path='/register' element={
        <Register/>
      }>
      </Route>
      <Route path='/my-account' element={
        <MyAccountRoute/>
      }>
      </Route>
    </Routes>
  )
}