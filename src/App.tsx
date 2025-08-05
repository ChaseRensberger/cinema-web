import { useEffect } from 'react';
import * as d3 from 'd3';

const Colors = {
	"project": "#059669",
	"actor": "#0ea5e9",
	"director": "#dc2626",
	"castingDirector": "#6b21a8",
};

interface Project {
	id: string;
	title: string;
	year: number;
	genre: string;
	cast: string[];
	director?: string;
	castingDirector?: string;
}

interface Person {
	id: string;
	name: string;
}

interface Config {
	projects: Project[];
	actors: Person[];
	directors: Person[];
	castingDirectors?: Person[];
}

interface Node {
	id: string;
	name: string;
	type: 'project' | 'actor' | 'director' | 'castingDirector';
	year?: number;
	genre?: string;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

interface Link {
	source: string | Node;
	target: string | Node;
	type: 'cast' | 'director' | 'castingDirector';
}

class NetworkVisualization {
	private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	private width: number = 0;
	private height: number = 0;
	private simulation: d3.Simulation<Node, Link> | null = null;
	private nodes: Node[] = [];
	private links: Link[] = [];
	private config: Config | null = null;

	constructor() {
		this.svg = d3.select('#network-svg');
		this.init();
	}

	async init() {
		this.config = await this.loadConfig();
		this.setupDimensions();
		this.setupSimulation();
		this.setupEventListeners();
		this.render();
	}

	async loadConfig(): Promise<Config> {
		const response = await fetch(`https://${import.meta.env.VITE_CLOUDFRONT_URL}/data.json`);
		return await response.json();
	}

	setupDimensions() {
		const container = document.getElementById('network-container');
		if (container) {
			this.width = container.clientWidth;
			this.height = container.clientHeight;

			this.svg
				.attr('width', this.width)
				.attr('height', this.height);
		}
	}

	setupSimulation() {
		this.simulation = d3.forceSimulation<Node>()
			.force('link', d3.forceLink<Node, Link>().id(d => d.id).distance(100))
			.force('charge', d3.forceManyBody<Node>().strength(-300))
			.force('center', d3.forceCenter(this.width / 2, this.height / 2))
			.force('collision', d3.forceCollide<Node>().radius(30));
	}

	setupEventListeners() {
		const reloadBtn = document.getElementById('reload-btn');
		if (reloadBtn) {
			reloadBtn.addEventListener('click', () => {
				this.reload();
			});
		}

		window.addEventListener('resize', () => {
			this.setupDimensions();
			if (this.simulation) {
				this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
				this.simulation.alpha(0.3).restart();
			}
		});
	}

	async reload() {
		this.config = await this.loadConfig();
		this.render();
	}

	processData() {
		if (!this.config) return;

		const nodeMap = new Map<string, Node>();
		const links: Link[] = [];

		this.config.projects.forEach(project => {
			if (!nodeMap.has(project.id)) {
				nodeMap.set(project.id, {
					id: project.id,
					name: project.title,
					type: 'project',
					year: project.year,
					genre: project.genre
				});
			}

			project.cast.forEach(actorId => {
				const actor = this.config!.actors.find(a => a.id === actorId);
				if (actor && !nodeMap.has(actor.id)) {
					nodeMap.set(actor.id, {
						id: actor.id,
						name: actor.name,
						type: 'actor'
					});
				}
				if (actor) {
					links.push({
						source: project.id,
						target: actor.id,
						type: 'cast'
					});
				}
			});

			if (project.director) {
				const director = this.config?.directors.find(d => d.id === project.director);
				if (director && !nodeMap.has(director.id)) {
					nodeMap.set(director.id, {
						id: director.id,
						name: director.name,
						type: 'director'
					});
				}
				if (director) {
					links.push({
						source: project.id,
						target: director.id,
						type: 'director'
					});
				}
			}

			if (project.castingDirector && this.config?.castingDirectors) {
				const castingDirector = this.config.castingDirectors.find(c => c.id === project.castingDirector);
				if (castingDirector && !nodeMap.has(castingDirector.id)) {
					nodeMap.set(castingDirector.id, {
						id: castingDirector.id,
						name: castingDirector.name,
						type: 'castingDirector'
					});
				}
				if (castingDirector) {
					links.push({
						source: project.id,
						target: castingDirector.id,
						type: 'castingDirector'
					});
				}
			}
		});

		this.nodes = Array.from(nodeMap.values());
		this.links = links;
	}

	render() {
		this.processData();

		this.svg.selectAll('*').remove();

		const g = this.svg.append('g');

		const zoom = d3.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
			});

		this.svg.call(zoom);

		const link = g.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(this.links)
			.enter().append('line')
			.attr('class', d => `link ${d.type}`)
			.attr('stroke-width', 2)
			.attr('stroke', d => "#FFFFFF")
			.attr('stroke-opacity', 0.7);

		const node = g.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(this.nodes)
			.enter().append('g')
			.attr('class', 'node cursor-pointer')
			.call(d3.drag<SVGGElement, Node>()
				.on('start', this.dragstarted.bind(this))
				.on('drag', this.dragged.bind(this))
				.on('end', this.dragended.bind(this)));

		node.append('circle')
			.attr('r', d => this.getNodeRadius(d))
			.attr('class', d => `node-circle ${d.type}`)
			.attr('fill', d => Colors[d.type])
			.attr('stroke', '#fff')
			.attr('stroke-width', 2);

		node.append('text')
			.text(d => d.name)
			.attr('class', 'node-label fill-white text-xs font-medium pointer-events-none')
			.attr('dx', 16)
			.attr('dy', 4)
			.style('text-shadow', '1px 1px 2px rgba(0, 0, 0, 0.8)');

		node.append('title')
			.text(d => this.getNodeTooltip(d));

		if (this.simulation) {
			this.simulation
				.nodes(this.nodes)
				.on('tick', () => {
					link
						.attr('x1', d => (d.source as Node).x || 0)
						.attr('y1', d => (d.source as Node).y || 0)
						.attr('x2', d => (d.target as Node).x || 0)
						.attr('y2', d => (d.target as Node).y || 0);

					node
						.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
				});

			(this.simulation.force('link') as d3.ForceLink<Node, Link>)
				.links(this.links);

			this.simulation.alpha(1).restart();
		}
	}

	getNodeRadius(d: Node): number {
		switch (d.type) {
			case 'project': return 10;
			case 'actor': return 10;
			case 'director': return 10;
			case 'castingDirector': return 10;
			default: return 10;
		}
	}

	getNodeTooltip(d: Node): string {
		switch (d.type) {
			case 'project':
				return `${d.name} (${d.year})\nGenre: ${d.genre}`;
			case 'actor':
			case 'director':
			case 'castingDirector':
				return d.name;
			default:
				return d.name;
		}
	}

	dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
		if (!event.active && this.simulation) this.simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
		d.fx = event.x;
		d.fy = event.y;
	}

	dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
		if (!event.active && this.simulation) this.simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}
}

export default function App() {
	useEffect(() => {
		new NetworkVisualization();
	}, []);

	return (
		<div id="app" className="h-screen flex flex-col">
			<header className="px-8 py-2 border-b-1 flex justify-between items-center flex-shrink-0 flex-col md:flex-row gap-4 md:gap-0 bg-black">
				<h1 className="text-2xl font-semibold">Cinema Web</h1>
				<div className="controls flex items-center gap-8 flex-col md:flex-row md:gap-8">
					<button
						id="reload-btn"
						className="bg-blue-800 hover:bg-blue-600 text-white border-none px-4 py-2 rounded cursor-pointer text-sm transition-colors duration-200"
					>
						Reload Data
					</button>
					<div className="legend flex gap-4 flex-wrap justify-center md:justify-start">
						<div className="legend-item flex items-center gap-2 text-sm">
							<div className="legend-color w-3 h-3 rounded-full" style={{ backgroundColor: Colors.project }}></div>
							<span>Project</span>
						</div>
						<div className="legend-item flex items-center gap-2 text-sm">
							<div className="legend-color w-3 h-3 rounded-full" style={{ backgroundColor: Colors.director }}></div>
							<span>Director</span>
						</div>
						<div className="legend-item flex items-center gap-2 text-sm">
							<div className="legend-color w-3 h-3 rounded-full" style={{ backgroundColor: Colors.actor }}></div>
							<span>Actor</span>
						</div>
						<div className="legend-item flex items-center gap-2 text-sm">
							<div className="legend-color w-3 h-3 rounded-full" style={{ backgroundColor: Colors.castingDirector }}></div>
							<span>Casting Director</span>
						</div>
					</div>
				</div>
			</header>
			<div id="network-container" className="flex-1 relative overflow-hidden">
				<svg id="network-svg" className="w-full h-full bg-black"></svg>
			</div>
		</div>
	);
}
