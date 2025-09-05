import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Users, BarChart3, Mail } from "lucide-react"

export default function InfoPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to our CHP Resident AI Project</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Created to encourage residents to explore and share how AI can support their training and patient care. 
          Through this website, you can log your own experiences using AI tools and learn from the insights your peers have shared.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Highlights Coming Soon</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>We are developing a "Highlights" page, which will offer quick tips, practical references, and time-saving strategies to make residency life a little easier with AI.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg">House Points</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>We will keep track of submissions and give House points to those who join in and contribute to this project!</p>
            <p>Check the Leaderboard to see how your rotation is doing.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              <CardTitle className="text-lg">HIPAA Warning</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>Please avoid HIPAA violations by never using sensitive patient information on the AI tools or to our website</strong></p>
            <p>No patient information should ever be included.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg">Contact & Access</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>Contact Sara Niederberger at <a href="mailto:niederbergers@upmc.edu" className="text-blue-600 hover:text-blue-700 underline">niederbergers@upmc.edu</a></p>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}