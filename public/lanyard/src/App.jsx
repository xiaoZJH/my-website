import Lanyard from './Lanyard.jsx'

function App() {
  return (
    <Lanyard
      position={[0, 0, 18]}
      gravity={[0, -40, 0]}
      fov={16}
      transparent={true}
      imageFit="cover"
      lanyardWidth={1.2}
    />
  )
}

export default App
