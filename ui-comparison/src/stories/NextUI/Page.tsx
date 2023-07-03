import {Navbar, Text, Grid, Avatar, Button, Container, Card, Link, Progress, Badge } from "@nextui-org/react"
import style from './Page.module.css';
import Image from "next/image";
import {MdArrowDropDown, MdOutlineFileDownload, MdArrowDownward, MdInfoOutline, MdOutlineFileUpload, MdOutlineGroup, MdOutlineAspectRatio, MdAddchart, MdBarChart, MdArrowRight, MdArrowOutward, MdOutlineArrowForward} from "react-icons/md";
import {FiEdit} from "react-icons/fi";
import {TbBuildingCommunity} from "react-icons/tb";
import {LiaTruckMovingSolid} from "react-icons/lia"
import {PiTrash} from "react-icons/pi";

export const Header = () => {
    return(
        <div
            className={style.root}
        >
            <Navbar disableBlur containerCss={{background: "transparent", border: "none"}} className={style.nav} css={{
                backgroundColor: "#001EA7",
                width: "1440px"
            }}>
                <Navbar.Brand  css={{gap: "56px"}}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M30.7279 5.27208C27.3279 1.87201 22.8081 0 18 0C13.1919 0 8.67214 1.87201 5.27208 5.27208C1.87201 8.67214 0 13.1919 0 18C0 22.8081 1.87201 27.3279 5.27208 30.7279C8.67214 34.128 13.1919 36 18 36C22.8081 36 27.3279 34.128 30.7279 30.7279C34.128 27.3279 36 22.8081 36 18C36 13.1919 34.128 8.67214 30.7279 5.27208V5.27208ZM1.79737 18.6821C1.95105 14.7565 3.66938 11.1135 6.63474 8.42039C9.59278 5.73459 13.4056 4.34266 17.3633 4.49195C23.8136 4.73931 28.8588 10.1899 28.6115 16.6403C28.5178 19.0685 27.4947 21.3269 25.731 22.9984C23.9702 24.6669 21.6679 25.5627 19.2353 25.532H19.0641C18.1815 25.4632 17.0633 25.1558 16.3417 24.1166C16.2992 24.0551 16.2583 23.9922 16.2187 23.9278C16.21 23.9132 16.2012 23.9 16.1924 23.8853C14.1901 20.538 17.3282 18.6382 17.3282 16.3753C17.3282 13.8813 15.4913 12.9563 14.578 12.8216C10.9379 12.2844 9.89283 15.8836 9.73914 17.2784C9.59278 18.6103 9.7772 19.995 10.3275 21.321C10.6891 22.1919 11.2291 22.9779 11.898 23.6556L11.8951 23.6585C13.8754 25.6388 16.4617 26.6531 19.0626 26.6999C19.127 26.6999 19.19 26.7014 19.2544 26.7014C19.2953 26.6999 19.3378 26.7014 19.3788 26.7014C22.0529 26.7014 24.5894 25.69 26.536 23.8458C28.5222 21.9636 29.6756 19.4197 29.7809 16.6842C30.0532 9.58985 24.5045 3.59619 17.4101 3.32249C17.1994 3.31371 16.9886 3.31078 16.7779 3.31078C12.7382 3.31078 8.87852 4.80371 5.85022 7.55391C5.28525 8.06619 4.76565 8.6136 4.28557 9.18588C7.19093 4.68076 12.2522 1.69198 18 1.69198C25.8876 1.69198 32.4843 7.32119 33.986 14.7726C34.0826 15.5952 34.1338 16.4383 34.1338 17.3048C33.9802 21.2303 32.2618 24.8733 29.2965 27.5664C26.3384 30.2522 22.5256 31.6442 18.5679 31.4949C12.1176 31.2461 7.07237 25.7969 7.31973 19.3466C7.4134 16.9184 8.43649 14.6599 10.2002 12.9885C11.961 11.3199 14.2633 10.4241 16.6959 10.4549H16.8686C17.7512 10.5237 18.8694 10.831 19.591 11.8702C19.6334 11.9317 19.6744 11.9946 19.7139 12.059C19.7227 12.0737 19.7315 12.0868 19.7403 12.1C21.7426 15.4474 18.6045 17.3472 18.6045 19.61C18.6045 22.1041 20.4414 23.0291 21.3547 23.1638C24.9948 23.7009 26.0398 20.1018 26.1935 18.7055C26.3384 17.3736 26.1555 15.9889 25.6051 14.6629C25.2436 13.792 24.7035 13.006 24.0346 12.3283L24.0376 12.3254C22.0572 10.3451 19.471 9.33079 16.8701 9.28395C16.8057 9.28395 16.7427 9.28248 16.6783 9.28248C16.6373 9.28395 16.5949 9.28248 16.5539 9.28248C13.8798 9.28248 11.3433 10.2939 9.39665 12.1381C7.41047 14.0203 6.25711 16.5642 6.15319 19.2997C5.88096 26.394 11.4297 32.3877 18.524 32.6614C18.7348 32.6702 18.9455 32.6731 19.1563 32.6731C23.196 32.6731 27.0556 31.1802 30.0839 28.43C30.7762 27.8006 31.4041 27.1244 31.9676 26.4058C29.1091 31.1348 23.919 34.3022 18.0029 34.3022C9.79915 34.3022 2.99171 28.2104 1.86177 20.314C1.82225 19.7769 1.80029 19.2324 1.80029 18.6777L1.79737 18.6821Z" fill="white"/>
                    </svg>
                    <Text css={{color:"White", fontWeight: "600"}}>
                        CityCatalyst
                    </Text>
                </Navbar.Brand>
                <Navbar.Content  css={{color: "White", borderRight: "1px solid #fff", height: "24px", paddingRight: "48px", gap: "48px", marginLeft: "248px"}}>
                    <Navbar.Link isActive css={{color: "White"}} href="#">Dashboard</Navbar.Link>
                    <Navbar.Link>City Status</Navbar.Link>
                    <Navbar.Link>Learning</Navbar.Link>
                    <Navbar.Link>About Us</Navbar.Link>
                </Navbar.Content>
                <Navbar.Content css={{color: "White", fontWeight: "300"}} >
                    <Grid.Container gap={1}>
                        <div className="lncontent" style={{
                            display: "flex",
                            alignItems: "center",
                            marginRight: "48px"
                        }}>
                            <Avatar 
                                rounded
                                css={{background: "black"}}
                                src="https://www.worldometers.info//img/flags/small/tn_us-flag.gif"
                            />
                            <Button style={{background: "transparent", color: "white", marginLeft: "-10px", fontSize:"14px", fontWeight: "500"}} size={"xs"} flat iconRight={<MdArrowDropDown size={24} fill="#fff" />}>
                                EN
                            </Button>
                        </div>
                        <div className="lncontent" style={{
                            display: "flex",
                            alignItems: "center"
                        }}>
                            <Avatar 
                                rounded
                                css={{background: "black"}}
                                src="https://placekitten.com/250/250"
                            />
                            <Button style={{background: "transparent", color: "white", fontSize:"14px", fontWeight: "500"}} size={"xs"}>
                                John Doe
                            </Button>
                        </div>
                    </Grid.Container>
                </Navbar.Content>
            </Navbar>
            <section className={style.heroSection}>
                <Container lg css={{paddingLeft: "137px", paddingRight: "137px", paddingTop: "64px", w: "1170px"}}>
                   <div>
                        <Text color="white" css={{fontWeight: "400"}}>
                            Welcome
                        </Text>
                        <div className="lncontent" style={{
                                display: "flex",
                                alignItems: "center",
                                marginRight: "48px",
                                marginTop: "-48px"
                            }}>
                                <Avatar 
                                    rounded
                                    css={{background: "black"}}
                                    src="https://www.worldometers.info//img/flags/small/tn_ar-flag.gif"
                                />
                                <Text style={{color: "white", marginLeft: "10px", fontSize:"45px", fontWeight: "500", top: "0px"}}>
                                    Ciudad Autónoma de Buenos Aires
                                </Text>
                        </div>
                        <div className={style.heroStats}>
                            <div className={style.heroItems}>
                                <div>
                                    <MdArrowOutward size={24} fill="White"/>
                                </div>
                                <div className={style.heroTextBox}>
                                    <div className={style.heroText}>
                                        <Text className={style.superText}>700</Text>
                                        <Text className={style.smallText}>Mtco2e</Text>
                                    </div>
                                    <div className={style.subText}>in 2023</div>
                                </div>
                            </div>
                            <div className={style.heroItems}>
                                <div>
                                    <MdOutlineGroup size={24} fill="White"/>
                                </div>
                                <div className={style.heroTextBox}>
                                    <div className={style.heroText}>
                                        <Text className={style.superText}>3,978.9</Text>
                                        <Text className={style.smallText}>M</Text>
                                    </div>
                                    <div className={style.subText}>Total population</div>
                                </div>
                            </div>
                            <div className={style.heroItems}>
                                <div>
                                    <MdOutlineAspectRatio size={24} fill="White"/>
                                </div>
                                <div className={style.heroTextBox}>
                                    <div className={style.heroText}>
                                        <Text className={style.superText}>782</Text>
                                        <Text className={style.smallText}>km2</Text>
                                    </div>
                                    <div className={style.subText}>Total land area</div>
                                </div>
                            </div>
                        </div>
                        <div className={style.heroCards}>
                            <Card variant="flat" css={{w: "254.5px", paddingLeft:"16px", border: "1px solid #5FE500", h: "188px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdAddchart size={32}/>
                                        <Text css={{color: "#008600", fontSize: "22px", fontWeight: "600"}}>Add Data</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Add your own data or <br /> connect to third-party data <br /> to the inventory
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "end", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Link>
                                        <Text color="#008600" css={{fontWeight: "600"}}>ADD DATA</Text>
                                        <MdOutlineArrowForward size={24} fill="#008600" style={{marginRight: "10px", marginLeft: "10px", fontWeight: "600", marginTop: "-3px"}}/>
                                    </Link>
                                </Card.Footer>
                            </Card>
                            <Card variant="flat" css={{w: "254.5px", paddingLeft:"16px", h: "188px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdOutlineFileUpload fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>Download</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Download a GPC format <br /> emissions inventory report
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "end", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Link>
                                        <Text color="#2351DC" css={{fontWeight: "600"}}>DOWNLOAD REPORT</Text>
                                        <MdOutlineArrowForward size={24} fill="#2351DC" style={{marginRight: "10px", marginLeft: "10px", fontWeight: "600", marginTop: "-3px"}}/>
                                    </Link>
                                </Card.Footer>
                            </Card>
                            <Card variant="flat" css={{w: "254.5px", paddingLeft:"16px", h: "188px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdBarChart fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>City Status</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Visualize, analyze, and gain new insights about your <br /> city
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "end", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Link>
                                        <Text color="#2351DC" css={{fontWeight: "600"}}>GO TO CITY STATUS</Text>
                                        <MdOutlineArrowForward size={24} fill="#2351DC" style={{marginRight: "10px", marginLeft: "10px", fontWeight: "600", marginTop: "-3px"}}/>
                                    </Link>
                                </Card.Footer>
                            </Card>
                            <Card variant="flat" css={{w: "254.5px", paddingLeft:"16px", h: "188px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdBarChart fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>Integtations</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Lorem ipsum dolor sit amet consectetur. Egestas bibendum.
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "end", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Link>
                                        <Text color="#2351DC" css={{fontWeight: "600"}}>SEE INTEGRATIONS</Text>
                                        <MdOutlineArrowForward size={24} fill="#2351DC" style={{marginRight: "10px", marginLeft: "10px", fontWeight: "600", marginTop: "-3px"}}/>
                                    </Link>
                                </Card.Footer>
                            </Card>
                        </div>
                   </div>
                </Container>
            </section>
            <section className={style.dashSection}>
                <Container lg css={{paddingLeft: "137px", paddingRight: "137px", paddingTop: "64px", w: "1170px"}}>
                    <div>
                        <Text css={{fontSize: "24px", fontWeight: "600"}}>
                            City’s GHG Inventory Status
                        </Text>
                        <Text css={{fontSize: "14px", fontWeight: "400px"}}>
                            CityCatalyst provides data coverage using existing datasets and advanced machine learning analysis. Improve accuracy by completing your data. 
                            <span style={{color: "#2351DC", textDecoration: "underline"}}>Learn more</span> about our calculation methodology.
                        </Text>
                    </div>

                    <div className={style.gpcBox}>
                        <div className={style.gpcBoxText}>
                            <div className={style.gpcBoxTextContent}>
                                <span >GPC Basic Standart</span>
                                <MdInfoOutline fill="#7A7B9A"/>
                            </div>
                            <div>
                                <span>
                                    City's inventory goal
                                </span>
                            </div>
                        </div>
                        <div className={style.btns}>
                            <Button rounded css={{fontFamily: "Poppins", background: "White", color: "#2351DC", border: "2px solid #2351DC", fontWeight: "600"}}>
                                <FiEdit size={24} style={{marginRight: "10px"}}/>
                                EDIT INVENTORY GOAL
                            </Button>
                            <Button rounded css={{fontFamily: "Poppins", color: "White", background: "#2351DC", fontWeight: "600"}}>
                                ADD DATA TO INVENTORY
                                <MdOutlineArrowForward size={24} style={{marginLeft: "10px"}}/>
                            </Button>
                        </div>
                    </div>
                    <div className={style.graphArea}>
                        <div className={style.frame1a}>
                            <div>
                                <Text css={{fontSize: "22px", fontWeight: "600", height: "40px", margin: "0px"}}>2023 Emissions Inventory</Text>
                                <Text css={{marginTop: "0px", fontSize: "14px", fontWeight: "400"}}>This tracks how much data you have collected or integrated in order to be ready to calculate a GPC Basic Standard Inventory</Text>
                            </div>
                            <div className={style.progressBar}>
                                <Progress value={90} css={{color: "#001EA7", w: "950px"}}/>
                                <Text css={{fontSize: "16px", fontWeight: "700"}}>100 % Completed</Text>
                            </div>
                            <div className={style.legend}>
                                <div className={style.legendItem}>
                                    <div style={{height: "12px", width: "12px", borderRadius: "100%", background: "#001EA7"}}/>
                                    <Text css={{fontSize: "12px", fontWeight: "400"}}>21% Data provided by CityCatalyst ML</Text>
                                </div>
                                <div className={style.legendItem}>
                                    <div style={{height: "12px", width: "12px", borderRadius: "100%", background: "#FA7200"}}/>
                                    <Text css={{fontSize: "12px", fontWeight: "400"}}>47% Connected third-party data</Text>
                                </div>
                                <div className={style.legendItem}>
                                    <div style={{height: "12px", width: "12px", borderRadius: "100%", background: "#24BE00"}}/>
                                    <Text css={{fontSize: "12px", fontWeight: "400"}}>32% Uploaded data</Text>
                                </div>
                            </div>
                        </div>
                        <hr style={{marginTop: "24px", border: "2px solid #E8EAFB"}}/>
                        <div className={style.frame1b}>
                            <div style={{display: "flex", gap: "16px"}}>
                                <div style={{display: "flex", height: "140px"}}><TbBuildingCommunity size={32} color="#2351DC"/></div>
                                <div>
                                    <div className={style.headingText}>
                                        <Text css={{margin: "0px", fontWeight: "600", fontSize: "22px"}}>Stationary energy</Text>
                                        <MdInfoOutline size={24} fill="#7A7B9A"/>
                                    </div>
                                    <Text css={{fontSize: "14px", fontWeight: "400"}}>This sector deals with emissions that result from the generation of electricity, heat, and steam, <br/> as well as their consumption</Text>
                                    <Text css={{fontSize: "14px", fontWeight: "600"}}>Required Scope: 1, 2</Text>
                                    <div style={{display: "flex", gap: "24px"}}>
                                        <Progress value={85} css={{color: "#001EA7", w: "619px", alignItems: "center"}}/>
                                        <Text css={{fontSize: "16px", fontWeight: "700", margin: "0px", marginTop: "-5px"}}>85%</Text>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <Button rounded css={{fontFamily: "Poppins", background: "White", color: "#2351DC", border: "2px solid #2351DC", fontWeight: "600"}}>
                                    ENHANCE SECTOR
                                    <MdOutlineArrowForward size={24} style={{marginLeft: "10px"}}/>
                                </Button>
                            </div>
                        </div>
                        <hr style={{marginTop: "24px", border: "2px solid #E8EAFB"}}/>
                        <div className={style.frame1b}>
                            <div style={{display: "flex", gap: "16px"}}>
                                <div style={{display: "flex", height: "140px"}}><LiaTruckMovingSolid size={32} color="#2351DC"/></div>
                                <div>
                                    <div className={style.headingText}>
                                        <Text css={{margin: "0px", fontWeight: "600", fontSize: "22px"}}>In-boundary transportation</Text>
                                        <MdInfoOutline size={24} fill="#7A7B9A"/>
                                    </div>
                                    <Text css={{fontSize: "14px", fontWeight: "400"}}>This sector deals with emissions from the transportation of goods and people within the city <br/> boundary</Text>
                                    <Text css={{fontSize: "14px", fontWeight: "600"}}>Required Scope: 1 </Text>
                                    <div style={{display: "flex", gap: "24px"}}>
                                        <Progress value={25} css={{color: "#001EA7", w: "619px", alignItems: "center"}}/>
                                        <Text css={{fontSize: "16px", fontWeight: "700", margin: "0px", marginTop: "-5px"}}>25%</Text>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <Button rounded css={{fontFamily: "Poppins", background: "White", color: "#2351DC", border: "2px solid #2351DC", fontWeight: "600"}}>
                                    ENHANCE SECTOR
                                    <MdOutlineArrowForward size={24} style={{marginLeft: "10px"}}/>
                                </Button>
                            </div>
                        </div>
                        <hr style={{marginTop: "24px", border: "2px solid #E8EAFB"}}/>
                        <div className={style.frame1b}>
                            <div style={{display: "flex", gap: "16px"}}>
                                <div style={{display: "flex", height: "140px"}}><PiTrash size={32} color="#2351DC"/></div>
                                <div>
                                    <div className={style.headingText}>
                                        <Text css={{margin: "0px", fontWeight: "600", fontSize: "22px"}}>Waste and wastewater generated</Text>
                                        <MdInfoOutline size={24} fill="#7A7B9A"/>
                                    </div>
                                    <Text css={{fontSize: "14px", fontWeight: "400"}}>This sector covers emissions generated from waste management processes.</Text>
                                    <Text css={{fontSize: "14px", fontWeight: "600"}}>Required Scope: 1, 3 </Text>
                                    <div style={{display: "flex", gap: "24px"}}>
                                        <Progress value={100} css={{color: "#001EA7", w: "619px", alignItems: "center"}}/>
                                        <Text css={{fontSize: "16px", fontWeight: "700", margin: "0px", marginTop: "-5px"}}>100%</Text>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <Button rounded css={{fontFamily: "Poppins", background: "White", color: "#2351DC", border: "2px solid #2351DC", fontWeight: "600"}}>
                                    ENHANCE SECTOR
                                    <MdOutlineArrowForward size={24} style={{marginLeft: "10px"}}/>
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className={style.downloadArea}>
                        <Text css={{fontWeight: "600", fontSize: "28px"}}>Download Data As</Text>
                        <div className={style.cards}>
                            <Card variant="flat" css={{w: "347.3px", paddingLeft:"16px", paddingRight:"16px", h: "236px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdBarChart fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>GPC Format</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                    Download your emission inventory in GPC <br/> compliant format to share with relevant <br /> stakeholders
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "center", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Button rounded css={{w: "300px", fontFamily: "Poppins", color: "White", fontSize: "16px", background: "#2351DC", fontWeight: "600"}}>
                                        <MdOutlineFileDownload size={24} style={{marginRight: "10px"}}/>
                                        <Text  css={{fontSize: "16px", color: "#ffffff", margin:"0px"}}>DOWNLOAD</Text>
                                    </Button>
                                </Card.Footer>
                            </Card>
                            <Card variant="flat" css={{w: "347.3px", paddingLeft:"16px", paddingRight:"16px", h: "236px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdBarChart fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>Raw CSV</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Download your climate data in raw CSV <br /> format to use in your own calculations, <br />processing and presentations
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "center", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Button rounded css={{w: "300px", fontFamily: "Poppins", color: "White", fontSize: "16px", background: "#2351DC", fontWeight: "600"}}>
                                        <MdOutlineFileDownload size={24} style={{marginRight: "10px"}}/>
                                        <Text  css={{fontSize: "16px", color: "#ffffff", margin:"0px"}}>DOWNLOAD</Text>
                                    </Button>
                                </Card.Footer>
                            </Card>
                            <Card variant="flat" css={{w: "347.3px", paddingLeft:"16px", paddingRight:"16px", h: "236px", background: "White", boxShadow: "0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)"}}>
                                <Card.Header css={{marginBottom: "0px", background:"transparent", h:"48px"}}>
                                    <div className={style.heroCardHeaderContent}>
                                        <MdBarChart fill="#2351DC" size={32}/>
                                        <Text css={{color: "#000", fontSize: "22px", fontWeight: "600"}}>CDP Format</Text>
                                    </div>
                                </Card.Header>
                                <Card.Body>
                                    <Text css={{fontSize: "14px", color: "#000000", marginTop: "-20px"}}>
                                        Download your emission inventory and <br /> climate plans in CDP compliant format to <br /> share with relevant stakeholders
                                    </Text>
                                </Card.Body>
                                <Card.Footer css={{display:"flex", justifyContent: "center", padding: "0", paddingBottom: "16px", gap: "8px"}}>
                                    <Button rounded css={{w: "300px", fontFamily: "Poppins", color: "White", fontSize: "16px", background: "#2351DC", fontWeight: "600"}}>
                                        <MdOutlineFileDownload size={24} style={{marginRight: "10px"}}/>
                                        <Text  css={{fontSize: "16px", color: "#ffffff", margin:"0px"}}>DOWNLOAD</Text>
                                    </Button>
                                </Card.Footer>
                            </Card>
                        </div>
                    </div>
                </Container>
            </section>
            <footer className={style.footer}>
                <Container lg css={{paddingLeft: "137px", paddingRight: "137px", paddingTop: "48px", w: "1170px"}}>
                    <div className={style.footerContentA}>
                        <div>
                            <Text css={{color:"White", fontWeight: "600", margin: "0px"}}>
                                CityCatalyst
                            </Text>
                        </div>
                        <div className={style.links}>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>About OpenClimate</Text>
                            </Link>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>Contribution Guid</Text>
                            </Link>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>Go to GitHub</Text>
                            </Link>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>CAD2.0 Community</Text>
                            </Link>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>Read the Docs</Text>
                            </Link>
                            <Link>
                                <Text css={{color: "white", fontSize: "14px"}}>Python Client Docs</Text>
                            </Link>
                        </div>
                        <div>
                            <Button rounded css={{w: "150px", fontFamily: "Poppins", color: "White", fontSize: "16px", background: "#2351DC", fontWeight: "600"}}>
                                <Text  css={{fontSize: "16px", color: "#ffffff", margin:"0px"}}>CONTACT US</Text>
                            </Button>
                        </div>
                    </div>
                    <hr style={{border: "1px solid #232640", marginTop: "28px", marginBottom: "28px"}}/>
                    <div className={style.footerBottomContent}>
                       <div className={style.footerBootomText}>
                            <Badge css={{background: "#D7D8FA", color: "#00001F", border: "none", height: "16px"}}>BETA</Badge>
                            <Text css={{color: "#fff", fontSize: "14px"}}>This site is a beta version, we appreciate all feedback to improve the platform</Text>
                            <Text css={{color: "#fff", fontSize: "14px", fontWeight: "500", textDecoration: "underline"}}>Send Feedback</Text>
                       </div>
                       <div className={style.footerOEFLogo}>
                            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M30.7279 5.27208C27.3279 1.87201 22.8081 0 18 0C13.1919 0 8.67214 1.87201 5.27208 5.27208C1.87201 8.67214 0 13.1919 0 18C0 22.8081 1.87201 27.3279 5.27208 30.7279C8.67214 34.128 13.1919 36 18 36C22.8081 36 27.3279 34.128 30.7279 30.7279C34.128 27.3279 36 22.8081 36 18C36 13.1919 34.128 8.67214 30.7279 5.27208V5.27208ZM1.79737 18.6821C1.95105 14.7565 3.66938 11.1135 6.63474 8.42039C9.59278 5.73459 13.4056 4.34266 17.3633 4.49195C23.8136 4.73931 28.8588 10.1899 28.6115 16.6403C28.5178 19.0685 27.4947 21.3269 25.731 22.9984C23.9702 24.6669 21.6679 25.5627 19.2353 25.532H19.0641C18.1815 25.4632 17.0633 25.1558 16.3417 24.1166C16.2992 24.0551 16.2583 23.9922 16.2187 23.9278C16.21 23.9132 16.2012 23.9 16.1924 23.8853C14.1901 20.538 17.3282 18.6382 17.3282 16.3753C17.3282 13.8813 15.4913 12.9563 14.578 12.8216C10.9379 12.2844 9.89283 15.8836 9.73914 17.2784C9.59278 18.6103 9.7772 19.995 10.3275 21.321C10.6891 22.1919 11.2291 22.9779 11.898 23.6556L11.8951 23.6585C13.8754 25.6388 16.4617 26.6531 19.0626 26.6999C19.127 26.6999 19.19 26.7014 19.2544 26.7014C19.2953 26.6999 19.3378 26.7014 19.3788 26.7014C22.0529 26.7014 24.5894 25.69 26.536 23.8458C28.5222 21.9636 29.6756 19.4197 29.7809 16.6842C30.0532 9.58985 24.5045 3.59619 17.4101 3.32249C17.1994 3.31371 16.9886 3.31078 16.7779 3.31078C12.7382 3.31078 8.87852 4.80371 5.85022 7.55391C5.28525 8.06619 4.76565 8.6136 4.28557 9.18588C7.19093 4.68076 12.2522 1.69198 18 1.69198C25.8876 1.69198 32.4843 7.32119 33.986 14.7726C34.0826 15.5952 34.1338 16.4383 34.1338 17.3048C33.9802 21.2303 32.2618 24.8733 29.2965 27.5664C26.3384 30.2522 22.5256 31.6442 18.5679 31.4949C12.1176 31.2461 7.07237 25.7969 7.31973 19.3466C7.4134 16.9184 8.43649 14.6599 10.2002 12.9885C11.961 11.3199 14.2633 10.4241 16.6959 10.4549H16.8686C17.7512 10.5237 18.8694 10.831 19.591 11.8702C19.6334 11.9317 19.6744 11.9946 19.7139 12.059C19.7227 12.0737 19.7315 12.0868 19.7403 12.1C21.7426 15.4474 18.6045 17.3472 18.6045 19.61C18.6045 22.1041 20.4414 23.0291 21.3547 23.1638C24.9948 23.7009 26.0398 20.1018 26.1935 18.7055C26.3384 17.3736 26.1555 15.9889 25.6051 14.6629C25.2436 13.792 24.7035 13.006 24.0346 12.3283L24.0376 12.3254C22.0572 10.3451 19.471 9.33079 16.8701 9.28395C16.8057 9.28395 16.7427 9.28248 16.6783 9.28248C16.6373 9.28395 16.5949 9.28248 16.5539 9.28248C13.8798 9.28248 11.3433 10.2939 9.39665 12.1381C7.41047 14.0203 6.25711 16.5642 6.15319 19.2997C5.88096 26.394 11.4297 32.3877 18.524 32.6614C18.7348 32.6702 18.9455 32.6731 19.1563 32.6731C23.196 32.6731 27.0556 31.1802 30.0839 28.43C30.7762 27.8006 31.4041 27.1244 31.9676 26.4058C29.1091 31.1348 23.919 34.3022 18.0029 34.3022C9.79915 34.3022 2.99171 28.2104 1.86177 20.314C1.82225 19.7769 1.80029 19.2324 1.80029 18.6777L1.79737 18.6821Z" fill="white"/>
                            </svg>
                            <Text css={{color:"White", fontWeight: "600"}}>
                                OpenEarth
                            </Text>
                       </div>
                    </div>
                </Container>
            </footer>
        </div>
    )
}

