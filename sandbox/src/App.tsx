import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card'
import { Button } from './components/ui/button'

function App() {
  return (
    <div className="min-h-screen p-8 bg-background">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Fulcrum Sandbox</CardTitle>
          <CardDescription>
            A minimal React environment for rendering artifacts
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
