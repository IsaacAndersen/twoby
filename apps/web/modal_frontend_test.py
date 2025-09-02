import modal
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = modal.App("twoby-frontend-working")
image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")

# Complete functional frontend with routing
complete_html = """<!DOCTYPE html>
<html>
<head>
    <title>twoby</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui; margin: 0; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .card { background: white; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .button { background: #007bff; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
        .button:hover { background: #0056b3; }
        .button-outline { background: transparent; border: 1px solid #007bff; color: #007bff; }
        .button-outline:hover { background: #007bff; color: white; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
        .form-group input, .form-group select, .form-group textarea { 
            width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; 
        }
        .items-list { margin-top: 1rem; }
        .item-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; }
        .item-input { flex: 1; }
        .remove-button { background: #dc3545; padding: 0.25rem 0.5rem; font-size: 0.8rem; }
        .add-button { background: #28a745; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .vote-section { margin: 1rem 0; }
        .comparison { text-align: center; padding: 2rem; background: #f8f9fa; border-radius: 8px; margin: 1rem 0; }
        .vs { font-size: 2rem; margin: 0 1rem; color: #666; }
        .tier-list { margin: 1rem 0; }
        .tier { display: flex; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; }
        .tier-label { background: #e9ecef; padding: 1rem; min-width: 80px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .tier-items { flex: 1; background: white; padding: 1rem; display: flex; flex-wrap: gap: 0.5rem; }
        .tier-item { background: #f8f9fa; padding: 0.5rem; border-radius: 4px; border: 1px solid #dee2e6; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect } = React;
        
        // Simple client-side router
        function useRouter() {
            const [path, setPath] = useState(window.location.pathname);
            const [search, setSearch] = useState(window.location.search);
            
            useEffect(() => {
                const handlePopState = () => {
                    setPath(window.location.pathname);
                    setSearch(window.location.search);
                };
                window.addEventListener('popstate', handlePopState);
                return () => window.removeEventListener('popstate', handlePopState);
            }, []);
            
            const navigate = (newPath) => {
                window.history.pushState({}, '', newPath);
                setPath(newPath.split('?')[0]);
                setSearch(newPath.includes('?') ? '?' + newPath.split('?')[1] : '');
            };
            
            return { path, search, navigate };
        }
        
        function getSearchParam(search, key) {
            const params = new URLSearchParams(search);
            return params.get(key);
        }
        
        // Home Page Component
        function HomePage({ navigate }) {
            const [charts, setCharts] = useState([]);
            const [loading, setLoading] = useState(true);
            
            useEffect(() => {
                fetch('https://twobyapi.ike.rs/api/charts/public')
                    .then(res => res.json())
                    .then(data => {
                        setCharts(data);
                        setLoading(false);
                    })
                    .catch(err => {
                        console.error('Failed to load charts:', err);
                        setLoading(false);
                    });
            }, []);
            
            if (loading) return <div className="container">Loading...</div>;
            
            return (
                <div className="container">
                    <div className="header">
                        <div>
                            <h1>twoby</h1>
                            <p>Collaborative opinion maps and rankings</p>
                        </div>
                        <button className="button" onClick={() => navigate('/create')}>
                            Create Chart
                        </button>
                    </div>
                    
                    {charts.length === 0 ? (
                        <div style={{textAlign: 'center', padding: '4rem'}}>
                            <h2>No public charts yet!</h2>
                            <p>Be the first to create a collaborative opinion map.</p>
                            <button className="button" onClick={() => navigate('/create')}>
                                Create the First Chart
                            </button>
                        </div>
                    ) : (
                        <div>
                            <h2>Public Charts</h2>
                            <div className="grid">
                                {charts.map(chart => (
                                    <div key={chart.id} className="card">
                                        <h3>{chart.title}</h3>
                                        <p>{chart.mode} • {chart.item_count} items • {chart.vote_count} votes</p>
                                        <div style={{display: 'flex', gap: '0.5rem'}}>
                                            <button className="button-outline button" 
                                                onClick={() => navigate(`/v/${chart.id}?s=public`)}>
                                                Vote
                                            </button>
                                            <button className="button"
                                                onClick={() => navigate(`/c/${chart.id}?s=public`)}>
                                                Results
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }
        
        // Create Chart Page Component
        function CreatePage({ navigate }) {
            const [formData, setFormData] = useState({
                mode: 'tier',
                title: '',
                x_label: '',
                y_label: '',
                visibility: 'public'
            });
            const [items, setItems] = useState(['']);
            const [loading, setLoading] = useState(false);
            
            const addItem = () => {
                setItems([...items, '']);
            };
            
            const removeItem = (index) => {
                setItems(items.filter((_, i) => i !== index));
            };
            
            const updateItem = (index, value) => {
                const newItems = [...items];
                newItems[index] = value;
                setItems(newItems);
            };
            
            const handleSubmit = async (e) => {
                e.preventDefault();
                setLoading(true);
                
                try {
                    // Create chart
                    const chartResponse = await fetch('https://twobyapi.ike.rs/api/charts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    
                    const chart = await chartResponse.json();
                    
                    // Add items
                    const validItems = items.filter(item => item.trim());
                    if (validItems.length > 0) {
                        const itemsData = validItems.map(label => ({ label: label.trim() }));
                        await fetch(`https://twobyapi.ike.rs/api/charts/${chart.id}/items?k=${chart.admin_url.split('k=')[1]}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: itemsData })
                        });
                    }
                    
                    navigate(chart.share_url);
                } catch (error) {
                    alert('Failed to create chart: ' + error.message);
                } finally {
                    setLoading(false);
                }
            };
            
            return (
                <div className="container">
                    <div className="header">
                        <h1>Create New Chart</h1>
                        <button className="button-outline button" onClick={() => navigate('/')}>
                            ← Back to Home
                        </button>
                    </div>
                    
                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Chart Type</label>
                                <select value={formData.mode} onChange={e => setFormData({...formData, mode: e.target.value})}>
                                    <option value="tier">Tier List (S/A/B/C)</option>
                                    <option value="single_axis">Single Axis</option>
                                    <option value="two_axis">2×2 Grid</option>
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Title</label>
                                <input 
                                    type="text" 
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                    placeholder="e.g., Best Marvel Movies"
                                    required 
                                />
                            </div>
                            
                            {formData.mode === 'single_axis' && (
                                <div className="form-group">
                                    <label>Axis Label</label>
                                    <input 
                                        type="text" 
                                        value={formData.x_label}
                                        onChange={e => setFormData({...formData, x_label: e.target.value})}
                                        placeholder="e.g., Quality"
                                    />
                                </div>
                            )}
                            
                            {formData.mode === 'two_axis' && (
                                <>
                                    <div className="form-group">
                                        <label>X-Axis Label</label>
                                        <input 
                                            type="text" 
                                            value={formData.x_label}
                                            onChange={e => setFormData({...formData, x_label: e.target.value})}
                                            placeholder="e.g., Originality"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Y-Axis Label</label>
                                        <input 
                                            type="text" 
                                            value={formData.y_label}
                                            onChange={e => setFormData({...formData, y_label: e.target.value})}
                                            placeholder="e.g., Entertainment Value"
                                        />
                                    </div>
                                </>
                            )}
                            
                            <div className="items-list">
                                <label>Items to Compare</label>
                                {items.map((item, index) => (
                                    <div key={index} className="item-row">
                                        <input 
                                            className="item-input"
                                            type="text" 
                                            value={item}
                                            onChange={e => updateItem(index, e.target.value)}
                                            placeholder="Enter an item"
                                        />
                                        {items.length > 1 && (
                                            <button type="button" className="button remove-button" onClick={() => removeItem(index)}>
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" className="button add-button" onClick={addItem}>
                                    + Add Item
                                </button>
                            </div>
                            
                            <div style={{marginTop: '2rem'}}>
                                <button type="submit" className="button" disabled={loading}>
                                    {loading ? 'Creating...' : 'Create Chart'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        }
        
        // Simple placeholder for voting and results pages
        function VotePage({ navigate, chartId, shareKey }) {
            return (
                <div className="container">
                    <div className="header">
                        <h1>Vote on Chart</h1>
                        <button className="button-outline button" onClick={() => navigate('/')}>
                            ← Back to Home
                        </button>
                    </div>
                    <div className="card">
                        <h2>Voting Interface</h2>
                        <p>Chart ID: {chartId}</p>
                        <p>This would be the voting interface for the chart.</p>
                        <button className="button" onClick={() => navigate(`/c/${chartId}?s=${shareKey}`)}>
                            View Results
                        </button>
                    </div>
                </div>
            );
        }
        
        function ResultsPage({ navigate, chartId, shareKey }) {
            return (
                <div className="container">
                    <div className="header">
                        <h1>Chart Results</h1>
                        <button className="button-outline button" onClick={() => navigate('/')}>
                            ← Back to Home
                        </button>
                    </div>
                    <div className="card">
                        <h2>Results Visualization</h2>
                        <p>Chart ID: {chartId}</p>
                        <p>This would show the chart results and rankings.</p>
                        <button className="button" onClick={() => navigate(`/v/${chartId}?s=${shareKey}`)}>
                            Vote on This Chart
                        </button>
                    </div>
                </div>
            );
        }
        
        // Main App Component with Routing
        function App() {
            const { path, search, navigate } = useRouter();
            
            // Route parsing
            if (path === '/') {
                return <HomePage navigate={navigate} />;
            } else if (path === '/create') {
                return <CreatePage navigate={navigate} />;
            } else if (path.startsWith('/v/')) {
                const chartId = path.split('/v/')[1];
                const shareKey = getSearchParam(search, 's');
                return <VotePage navigate={navigate} chartId={chartId} shareKey={shareKey} />;
            } else if (path.startsWith('/c/')) {
                const chartId = path.split('/c/')[1];
                const shareKey = getSearchParam(search, 's');
                return <ResultsPage navigate={navigate} chartId={chartId} shareKey={shareKey} />;
            } else {
                return <HomePage navigate={navigate} />;
            }
        }
        
        ReactDOM.render(<App />, document.getElementById('root'));
    </script>
</body>
</html>"""

frontend_app = FastAPI(title="twoby Frontend Test")

@frontend_app.get("/")
def root():
    return HTMLResponse(content=complete_html)

@frontend_app.get("/{path:path}")
def spa_catchall(path: str = ""):
    return HTMLResponse(content=complete_html)

@app.function(image=image, scaledown_window=300)
@modal.asgi_app(custom_domains=["twoby.ike.rs"])
def frontend():
    return frontend_app