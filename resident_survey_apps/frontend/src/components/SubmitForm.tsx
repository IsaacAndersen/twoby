import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import confetti from "canvas-confetti"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChevronLeft, ChevronRight, Trophy, CheckCircle, Camera, Upload } from "lucide-react"
import ResidentPicker from "./ResidentPicker"
import ToolPicker from "./ToolPicker"

const ROTATIONS = [
  "Continuity Clinic", "PHM", "Cardiology", "Renal/Pulm", "Heme/Endo", 
  "Oncology", "GI", "Neurology", "Emergency Department", "PICU", "NICU", 
  "CDU", "Behavioral Health", "Adolescent", "Infectious Diseases", 
  "Elective (other)", "RAC", "Research", "Boards/Step"
]
const TASKS = [
  "Answering clinical questions", "Finding evidence-based practices", 
  "Literature reviews", "Creating departs", "Translating departs", 
  "Creating patient messages", "Documentation", "Board prep", 
  "Role-play scenarios", "Procedural competency", "Mentorship", 
  "Applications", "Create graphics, presentations, tables", 
  "Statistical analyses", "Medical education", "Other"
]
const TOOLS = [
  "OpenEvidence", "Copilot", "ChatGPT", "Perplexity", "SciSpace", "Consensus", 
  "Semantic Scholar", "Elicit", "Claude", "Copy-ai", "Gemini", "Med-PaLM", "Other"
]
const VERIFY_OPTIONS = ["Yes", "No", "Somewhat", "Not sure"]
const TIME_OPTIONS = ["None", "1 minute", "5 minutes", "10+ minutes", "30+ minutes", "I lost time"]

interface SubmissionData {
  rotation: string
  used_ai: boolean
  task: string
  tool: string
  tool_other?: string
  helpfulness: number | null
  task_description?: string
  time_saved: string | null
  verify_conf: string
  notes?: string
  resident_name?: string
  task_image?: string
}

export default function SubmitForm() {
  const [currentStep, setCurrentStep] = useState(1)
  const [usedAI, setUsedAI] = useState<boolean | null>(true)
  const [helpfulness, setHelpfulness] = useState<number>(5)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [showSuccess, setShowSuccess] = useState<boolean>(false)
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState<boolean>(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedResident, setSelectedResident] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    rotation: "",
    task: "",
    tool: "OpenEvidence",
    tool_other: "",
    verify_conf: "",
    task_description: "",
    time_saved: null as string | null,
    notes: "",
    task_image: "" as string
  })
  const [showUploadWarning, setShowUploadWarning] = useState(false)

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Show HIPAA warning before proceeding
    setShowUploadWarning(true)
    
    // Convert to base64 for simple storage (in real app, would upload to server)
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setFormData(prev => ({ ...prev, task_image: result }))
    }
    reader.readAsDataURL(file)
  }

  // Load saved data from localStorage and cookies
  useEffect(() => {
    const savedRotation = localStorage.getItem('lastRotation')
    if (savedRotation) {
      setFormData(prev => ({ ...prev, rotation: savedRotation }))
    }
    
    // Load resident from cookie
    const cookies = document.cookie.split(';')
    const residentCookie = cookies.find(cookie => cookie.trim().startsWith('resident_name='))
    if (residentCookie) {
      const residentName = decodeURIComponent(residentCookie.split('=')[1])
      setSelectedResident(residentName)
    }
  }, [])

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (step === 1) {
      if (!selectedResident) newErrors.selectedResident = "Please select your name"
      if (usedAI === null) newErrors.usedAI = "Please confirm whether you used AI"
      if (!formData.rotation) newErrors.rotation = "Please select your rotation/team"
      if (!formData.task) newErrors.task = "Please select the task type"
    }
    
    if (step === 2 && usedAI) {
      if (!formData.tool) newErrors.tool = "Please select which AI tool you used"
      if (formData.tool === "Other" && !formData.tool_other) newErrors.tool_other = "Please specify which tool"
      if (!formData.verify_conf) newErrors.verify_conf = "Please select whether you verified the output"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => prev - 1)
    setErrors({})
  }

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  async function handleSubmit() {
    if (!validateStep(currentStep)) return
    
    setIsSubmitting(true)

    const payload: SubmissionData = {
      rotation: formData.rotation,
      used_ai: usedAI!,
      task: formData.task,
      tool: formData.tool,
      tool_other: formData.tool === "Other" ? formData.tool_other : undefined,
      helpfulness: usedAI ? helpfulness : null,
      task_description: formData.task_description || undefined,
      task_image: formData.task_image || undefined,
      time_saved: formData.time_saved,
      verify_conf: formData.verify_conf,
      notes: formData.notes || undefined,
      resident_name: selectedResident || undefined
    }

    try {
      // Save rotation to localStorage
      localStorage.setItem('lastRotation', formData.rotation)
      
      const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
      const res = await fetch(`${API_BASE}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setShowSuccess(true)
        
        if (!hasSubmittedOnce) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          })
          setHasSubmittedOnce(true)
        }
        
        // Reset form
        setCurrentStep(1)
        setUsedAI(true)
        setHelpfulness(5)
        setFormData({
          rotation: formData.rotation, // Keep rotation
          task: "",
          tool: "OpenEvidence",
          tool_other: "",
          verify_conf: "",
          task_description: "",
          time_saved: null,
          notes: "",
          task_image: ""
        })
        setErrors({})
        
        setTimeout(() => setShowSuccess(false), 4000)
      } else {
        alert("Error submitting. Please try again.")
      }
    } catch (error) {
      console.error("Submission error:", error)
      alert("Error submitting. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalSteps = usedAI === false ? 2 : 3

  if (showSuccess) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-green-900 mb-2">Thanks for your submission! 🎉</h2>
            <p className="text-green-700 mb-6">Your data helps improve AI usage in healthcare.</p>
            <div className="flex gap-3 justify-center">
              <Button 
                variant="outline" 
                onClick={() => setShowSuccess(false)}
                className="border-green-300 text-green-700 hover:bg-green-100"
              >
                Submit another
              </Button>
              <Button asChild className="bg-green-600 hover:bg-green-700">
                <Link to="/leaderboard">
                  <Trophy className="h-4 w-4 mr-1" />
                  View leaderboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-1">Share your AI experience</h1>
        <p className="text-sm text-muted-foreground">Take this 30 second survey.</p>
        
        <div className="flex justify-center mt-4">
          <Badge variant="outline" className="text-xs">
            Step {currentStep} of {totalSteps}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="w-full bg-muted rounded-full h-1">
            <div 
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {currentStep === 1 && (
            <>
              {/* Resident Picker */}
              <div className="relative">
                <ResidentPicker
                  selectedResident={selectedResident}
                  onSelect={setSelectedResident}
                />
                {errors.selectedResident && <p className="text-sm text-red-500 mt-1">{errors.selectedResident}</p>}
              </div>

              {/* Did you use AI? */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Have you used AI tools recently?</label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant={usedAI === true ? "default" : "outline"} 
                    onClick={() => setUsedAI(true)}
                    className="flex-1"
                  >
                    Yes
                  </Button>
                  <Button 
                    type="button" 
                    variant={usedAI === false ? "default" : "outline"} 
                    onClick={() => setUsedAI(false)}
                    className="flex-1"
                  >
                    No
                  </Button>
                </div>
                {errors.usedAI && <p className="text-sm text-red-500">{errors.usedAI}</p>}
              </div>

              {/* Rotation/Team */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Rotation/Team</label>
                <Select 
                  value={formData.rotation} 
                  onValueChange={(value) => handleFieldChange('rotation', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your current rotation" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROTATIONS.sort().map((rotation) => (
                      <SelectItem key={rotation} value={rotation}>
                        {rotation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.rotation && <p className="text-sm text-red-500">{errors.rotation}</p>}
              </div>

              {/* Task Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">What type of task did you use the tools for?</label>
                <Select 
                  value={formData.task} 
                  onValueChange={(value) => handleFieldChange('task', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASKS.map((task) => (
                      <SelectItem key={task} value={task}>
                        {task.replace(/([A-Z])/g, ' $1').trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.task && <p className="text-sm text-red-500">{errors.task}</p>}
              </div>
            </>
          )}

          {currentStep === 2 && usedAI && (
            <>
              {/* AI Tool */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Which AI tool?</label>
                <ToolPicker
                  tools={TOOLS}
                  selectedTool={formData.tool}
                  onSelect={(tool) => handleFieldChange('tool', tool)}
                  placeholder="Select AI tool"
                  error={errors.tool}
                />
                
                {formData.tool === "Other" && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Please specify which tool..."
                      value={formData.tool_other}
                      onChange={(e) => handleFieldChange('tool_other', e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    {errors.tool_other && <p className="text-sm text-red-500">{errors.tool_other}</p>}
                  </div>
                )}
              </div>

              {/* Helpfulness */}
              <div className="space-y-3">
                <label className="text-sm font-medium">How helpful was the tool? ({helpfulness}/10)</label>
                <div className="px-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={helpfulness}
                    onChange={(e) => setHelpfulness(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Not helpful</span>
                    <span>Very helpful</span>
                  </div>
                </div>
              </div>

              {/* Task Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Task description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description of what you used AI for..."
                  value={formData.task_description}
                  onChange={(e) => handleFieldChange('task_description', e.target.value)}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                
                {/* Image Upload */}
                <div className="pt-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="task-image-upload"
                  />
                  <label htmlFor="task-image-upload" className="block">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="cursor-pointer w-full justify-center"
                      asChild
                    >
                      <span>
                        <Camera className="h-4 w-4 mr-1" />
                        Add Image (optional)
                      </span>
                    </Button>
                  </label>
                  {formData.task_image && (
                    <Badge variant="secondary" className="text-xs mt-2">
                      Image attached
                    </Badge>
                  )}
                </div>

                {/* HIPAA Warning */}
                {showUploadWarning && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertDescription className="text-amber-800 text-sm">
                      ⚠️ <strong>HIPAA Warning:</strong> Do not upload any images containing patient information, medical records, or other protected health information (PHI).
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Verification */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Did you verify the output?</label>
                <div className="grid grid-cols-4 gap-2">
                  {VERIFY_OPTIONS.map((verify) => (
                    <button
                      key={verify}
                      type="button"
                      onClick={() => handleFieldChange('verify_conf', verify)}
                      className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                        formData.verify_conf === verify
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {verify}
                    </button>
                  ))}
                </div>
                {errors.verify_conf && <p className="text-sm text-red-500">{errors.verify_conf}</p>}
              </div>
            </>
          )}

          {((currentStep === 2 && !usedAI) || (currentStep === 3 && usedAI)) && (
            <>
              {/* Time Saved */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Time saved (optional)</label>
                <Select 
                  value={formData.time_saved || ""} 
                  onValueChange={(value) => handleFieldChange('time_saved', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time saved" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  rows={3}
                  placeholder="Any additional context or observations..."
                  value={formData.notes}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            {currentStep > 1 ? (
              <Button 
                type="button" 
                variant="outline" 
                onClick={prevStep}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {currentStep < totalSteps ? (
              <Button onClick={nextStep} className="flex items-center gap-1">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="flex items-center gap-1"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}